# The game server reports here when a world character steps through one of
# their zone's exits. Rails works out where that exit leads and moves the
# character's position there; the client then reloads the world's play page,
# which joins the zone on the far side.
class InternalApi::ZoneExitsController < InternalApi::BaseController
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found

  def create
    world_character = WorldCharacter.find(params[:world_character_id])
    return render_unprocessable("#{world_character.id} isn't in #{zone_identifier}") unless in_zone?(world_character)

    destination = destination_for(world_character.world_version)
    return render_unprocessable("#{zone_identifier} #{connection} doesn't lead anywhere") unless destination

    move_to(world_character, destination)
  end

  private

  def move_to(world_character, destination)
    world_character.update!(zone_identifier: destination["zone"], connection_key: destination["connection"])
    render json: {zone_identifier: destination["zone"], connection: destination["connection"]}
  end

  def zone_identifier = params[:zone_identifier].to_s

  def connection = params[:connection].to_s

  def in_zone?(world_character)
    world_character.world_version && world_character.zone_identifier == zone_identifier
  end

  def destination_for(version)
    version.zones.find_by(identifier: zone_identifier)&.links&.dig(connection)
  end

  def render_not_found(err)
    render json: {error: err.message}, status: :not_found
  end

  def render_unprocessable(message)
    render json: {error: message}, status: :unprocessable_content
  end
end
