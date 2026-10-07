class Play::CharacterItemsController < Play::BaseController
  rescue_from ArgumentError, with: :render_bad_restrictions

  before_action :load_character

  def index
    authorize! :read, CharacterItem
    @items = filtered_items
    @filter_slots = filter_slots
    respond_to do |format|
      format.html
      format.json { render json: @items.map { |item| params[:lean].present? ? lean_item_json(item) : item_json(item) } }
    end
  end

  def show
    @item = @world_character.character_items.find(params[:id])
    authorize! :read, @item
    @raw_stats = ItemStats::Raw.call(character_item: @item)
  end

  private

  def filtered_items
    items = @world_character.character_items.includes(world_version: :world).order(created_at: :desc)
    items = items.where(slot: filter_slots) if filter_slots.present?
    restrictions ? items.select { |item| restrictions.allows?(item) } : items
  end

  # Only the items the client's provenance restrictions (a JSON array of
  # layers, see ProvenanceRestrictions) allow; nil when none were sent.
  def restrictions
    return unless params[:restrictions].present?
    @restrictions ||= ProvenanceRestrictions.from_json(params[:restrictions], own_world_key: @world.key)
  end

  # The listing without the stats block, for long pulldowns.
  def lean_item_json(item)
    {id: item.id, identifier: item.identifier, name: item.name, slot: item.slot, elvl: item.elvl, provenance: item.provenance_label}
  end

  def render_bad_restrictions(err)
    render json: {error: err.message}, status: :unprocessable_content
  end

  def item_json(item)
    {
      id: item.id,
      identifier: item.identifier,
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
