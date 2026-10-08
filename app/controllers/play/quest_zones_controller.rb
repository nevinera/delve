# A zone's display names, for the quest log entries of a zone other than
# the one the player is in: read from the Zone row, never the zone file.
class Play::QuestZonesController < Play::BaseController
  before_action :load_character

  def show
    zone = zones.find_by!(identifier: params[:zone])
    render json: {identifier: zone.identifier, name: zone.name.presence || zone.identifier, map_names: zone.map_names}
  end

  private

  # The zones of the character's current version of this world.
  def zones
    world_character = @character.world_characters.find_by!(world: World.find(params[:world_id]))
    world_character.world_version&.zones || Zone.none
  end

  def load_character
    @character = current_user.characters.find(params[:character_id])
    authorize! :read, @character
  end
end
