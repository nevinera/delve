class Play::EquippedItemsController < Play::BaseController
  before_action :load_character

  def index
    authorize! :read, EquippedItem
    @equipped_items = @character.equipped_items.includes(character_item: :provenance_zone).order(:equipped_slot)
  end

  private

  def load_character
    @character = current_user.characters.find(params[:character_id])
  end
end
