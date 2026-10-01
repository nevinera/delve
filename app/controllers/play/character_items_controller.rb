class Play::CharacterItemsController < Play::BaseController
  before_action :load_character

  def index
    authorize! :read, CharacterItem
    @items = filtered_items
    @filter_slots = filter_slots
    respond_to do |format|
      format.html
      format.json { render json: @items.map { |item| item_json(item) } }
    end
  end

  def show
    @item = @world_character.character_items.find(params[:id])
    authorize! :read, @item
    @raw_stats = ItemStats::Raw.call(character_item: @item)
  end

  private

  def filtered_items
    items = @world_character.character_items.order(received_at: :desc)
    items = items.where(slot: filter_slots) if filter_slots.present?
    items
  end

  def item_json(item)
    {
      id: item.id,
      identifier: item.identifier,
      source_key: item.source_key,
      name: item.name,
      slot: item.slot,
      elvl: item.elvl,
      shield: item.source_json["shield"] == true,
      weapon_type: item.source_json["weaponType"],
      description: item.description,
      primary_stat: item.primary_stat,
      secondary_stats: item.secondary_stats,
      stats: ItemStats::Raw.call(character_item: item)
    }
  end

  def filter_slots = Array(params[:slot]).presence

  # Items belong to the character's time in one world.
  def load_character
    @character = current_user.characters.find(params[:character_id])
    @world = World.find(params[:world_id])
    @world_character = @character.world_characters.find_by!(world: @world)
  end
end
