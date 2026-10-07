# Whether a character holds one flag in a world, for the game client to ask
# about flags its zone didn't preload (see docs/flags.md).
class Play::CharacterFlagsController < Play::BaseController
  before_action :load_character

  def show
    return render(json: {error: "#{flag} isn't a valid flag"}, status: :unprocessable_content) unless CharacterFlag.valid_flag?(flag)

    world_character = @character.world_characters.find_by(world: World.find(params[:world_id]))
    render json: {held: world_character.present? && CharacterFlag.held?(world_character, flag)}
  end

  private

  def flag = params[:flag]

  def load_character
    @character = current_user.characters.find(params[:character_id])
    authorize! :read, @character
  end
end
