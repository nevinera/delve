class Play::ZonesController < Play::BaseController
  layout "game_client"

  def show
    @character = current_user.characters.find(params[:character_id])
    authorize! :read, @character
    @zone = Zone.find(params[:id])
    @result = JoinZone.call(character: @character, zone: @zone)
    @owned_zone_items = owned_zone_items_map
  end

  private

  def owned_zone_items_map
    @character.character_items
      .joins(:provenance_zone)
      .where(zones: {identifier: @zone.identifier})
      .each_with_object({}) do |item, hash|
        hash[item.identifier] = item.source_key == "#{@zone.identifier}/#{@zone.version}/#{item.identifier}"
      end
  end
end
