# The game server's visit calls (see plans/map-visits.md): recording that a
# world character has been to a zone, a map in it, or a place on that map.
class InternalApi::CharacterVisitsController < InternalApi::BaseController
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::RecordInvalid, with: :render_invalid

  # Idempotent: recording a visit already recorded succeeds and changes
  # nothing.
  def create
    world_character = WorldCharacter.find(params[:world_character_id])
    CharacterVisit.record!(world_character, zone: params[:zone], map: params[:map], place: params[:place])
    render json: {zone: params[:zone], map: params[:map].to_s, place: params[:place].to_s}, status: :created
  end

  private

  def render_invalid(err)
    render json: {error: err.record.errors.full_messages.to_sentence}, status: :unprocessable_content
  end

  def render_not_found(err)
    render json: {error: err.message}, status: :not_found
  end
end
