class Play::EquippedItemsController < Play::BaseController
  rescue_from EquipItem::IncompatibleSlot, ActiveRecord::RecordInvalid, with: :render_unprocessable

  before_action :load_character

  def index
    authorize! :read, EquippedItem
    @equipped_items_by_slot = @character.equipped_items.includes(character_item: :provenance_zone).index_by(&:equipped_slot)
  end

  def update
    authorize! :update, EquippedItem
    if character_item_id.present?
      item = @character.character_items.find(character_item_id)
      EquipItem.call(character_item: item, equipped_slot: params[:equipped_slot])
    else
      @character.equipped_items.find_by(equipped_slot: params[:equipped_slot])&.destroy!
    end
    redirect_to play_character_equipped_items_path(@character), notice: "Updated."
  end

  private

  def character_item_id = params[:character_item_id].presence

  def load_character
    @character = current_user.characters.find(params[:character_id])
  end

  def render_unprocessable(err)
    redirect_to play_character_equipped_items_path(@character), alert: err.message
  end
end
