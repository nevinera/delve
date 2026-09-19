class Play::ZonesController < Play::BaseController
  layout "game_client", except: :index

  def index
    @character = current_user.characters.find(params[:character_id])
    authorize! :read, @character
    @zones = Zone.where(state: :fetched).order(:identifier, :version)
  end

  def show
    @character = current_user.characters.find(params[:character_id])
    authorize! :read, @character
    @zone = Zone.find(params[:id])
    @result = JoinZone.call(character: @character, zone: @zone)
    @owned_zone_items = owned_zone_items_map
    assign_character_data
    assign_stock_assets
  end

  private

  def owned_zone_items_map
    @character.owned_zone_items_for(@zone)
  end

  def assign_character_data
    @equipped_items = EquippedItems::ForCharacter.call(character: @character)
    @character_settings = @character.setting_or_default.as_client_json
  end

  def assign_stock_assets
    @stock_assets = Content::StockAssets.client_json
  end
end
