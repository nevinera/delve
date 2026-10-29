# A character in a world, for the game server: who it is and how it looks as it enters, and where
# it is, which the server reads on entry and writes back as it plays.
class InternalApi::CharactersController < InternalApi::BaseController
  before_action :find_records

  def show
    position = @world.world_characters.find_by(character: @character)&.position
    render json: {id: @character.id, name: @character.name, look: @character.look, position:}
  end

  def position
    at = Array(params[:at])
    return render json: {error: "at needs 3 numbers"}, status: :unprocessable_content unless at.size == 3

    record = @world.world_characters.find_or_initialize_by(character: @character)
    if record.update(continent: params[:continent], x: at[0], y: at[1], z: at[2], yaw: params[:yaw])
      head :no_content
    else
      render json: {error: record.errors.full_messages.to_sentence}, status: :unprocessable_content
    end
  end

  private

  def find_records
    @world = World.find(params[:world_id])
    @character = Character.find(params[:id])
  end
end
