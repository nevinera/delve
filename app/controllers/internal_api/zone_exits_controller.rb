# The game server reports here when a world character steps through one of
# their zone's exits. Rails works out where that exit leads and moves the
# character's position there; the client then reloads the world's play page,
# which joins the zone on the far side.
class InternalApi::ZoneExitsController < InternalApi::BaseController
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found

  def create
    world_character = WorldCharacter.find(params[:world_character_id])
    version = world_character.world_version
    zone_identifier = params[:zone_identifier].to_s
    connection = params[:connection].to_s

    unless version && world_character.zone_identifier == zone_identifier
      return render_unprocessable("#{world_character.id} isn't in #{zone_identifier}")
    end

    destination = version.zones.find_by(identifier: zone_identifier)&.links&.dig(connection)
    return render_unprocessable("#{zone_identifier} #{connection} doesn't lead anywhere") unless destination

    world_character.update!(zone_identifier: destination["zone"], connection_key: destination["connection"])
    render json: {zone_identifier: destination["zone"], connection: destination["connection"]}
  end

  private

  def render_not_found(err)
    render json: {error: err.message}, status: :not_found
  end

  def render_unprocessable(message)
    render json: {error: message}, status: :unprocessable_content
  end
end
