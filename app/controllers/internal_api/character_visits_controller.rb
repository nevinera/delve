# The game server's visit calls (see plans/map-visits.md): recording that a
# world character has been to a zone, a map in it, or a place on that map.
class InternalApi::CharacterVisitsController < InternalApi::BaseController
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::RecordInvalid, with: :render_invalid

  # Idempotent: recording a visit already recorded succeeds and changes
  # nothing.
  def create
    world_character = WorldCharacter.find(params[:world_character_id])
    zone, map, place = params.values_at(:zone, :map, :place)
    CharacterVisit.record!(world_character, zone:, map:, place:)
    render json: {zone:, map: map.to_s, place: place.to_s}, status: :created
  end

  private

  def render_invalid(err)
    render json: {error: err.record.errors.full_messages.to_sentence}, status: :unprocessable_content
  end

  def render_not_found(err)
    render json: {error: err.message}, status: :not_found
  end
end
