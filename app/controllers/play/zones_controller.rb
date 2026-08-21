class Play::ZonesController < Play::BaseController
  layout "game_client"

  def show
    @character = current_user.characters.find(params[:character_id])
    authorize! :read, @character
    @zone = Zone.find(params[:id])
    @result = JoinZone.call(character: @character, zone: @zone)
    @owned_zone_items = owned_zone_items_map
    @equipped_items = EquippedItems::ForCharacter.call(character: @character)
    assign_equipment_urls
  end

  private

  def owned_zone_items_map
    @character.owned_zone_items_for(@zone)
  end

  def assign_equipment_urls
    @character_items_url = play_character_character_items_path(@character, format: :json)
    @equipped_items_url = play_character_equipped_items_path(@character)
  end
end
