# A character in a world, for the game server: who it is and how it looks as it enters, and its
# class and where it is, which the server reads on entry and writes back as it plays.
class InternalApi::CharactersController < InternalApi::BaseController
  before_action :find_records

  def show
    record = @world.world_characters.find_by(character: @character)
    render json: {id: @character.id, name: @character.name, look: @character.look, class: record&.class_id, level: record&.level || 1, position: record&.position, systemAdmin: @character.user.system_admin?}
  end

  def position
    at = Array(params[:at])
    return render json: {error: "at needs 3 numbers"}, status: :unprocessable_content unless at.size == 3

    write({continent: params[:continent], x: at[0], y: at[1], z: at[2], yaw: params[:yaw]}, :position)
  end

  def pick_class
    write({class_id: params[:class]}, :class_pick)
  end

  private

  def write(attributes, context)
    record = @world.world_characters.find_or_initialize_by(character: @character)
    record.assign_attributes(attributes)
    if record.save(context:)
      head :no_content
    else
      render json: {error: record.errors.full_messages.to_sentence}, status: :unprocessable_content
    end
  end

  def find_records
    @world = World.find(params[:world_id])
    @character = Character.find(params[:id])
  end
end
