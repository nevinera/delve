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
    @item = @character.character_items.find(params[:id])
    authorize! :read, @item
  end

  private

  def filtered_items
    items = @character.character_items.includes(:provenance_zone).order(received_at: :desc)
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
      ilvl: item.ilvl,
      description: item.description,
      stats: item.stats_hash
    }
  end

  def filter_slots = Array(params[:slot]).presence

  def load_character
    @character = current_user.characters.find(params[:character_id])
  end
end
