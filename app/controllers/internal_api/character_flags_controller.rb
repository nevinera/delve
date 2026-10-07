# The game server's flag calls (see plans/flags.md): whether a world
# character holds one flag, and granting one.
class InternalApi::CharacterFlagsController < InternalApi::BaseController
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found

  before_action :load_world_character

  def show
    return render_invalid unless CharacterFlag.valid_flag?(params[:flag])
    render json: {held: CharacterFlag.held?(@world_character, params[:flag])}
  end

  # Idempotent: granting a held flag succeeds and changes nothing.
  def create
    return render_invalid unless CharacterFlag.valid_flag?(params[:flag])
    CharacterFlag.grant!(@world_character, params[:flag])
    render json: {flag: params[:flag]}, status: :created
  end

  private

  def load_world_character
    @world_character = WorldCharacter.find(params[:world_character_id])
  end

  def render_invalid
    render json: {error: "#{params[:flag]} isn't a valid flag"}, status: :unprocessable_content
  end

  def render_not_found(err)
    render json: {error: err.message}, status: :not_found
  end
end
