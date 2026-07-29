class Play::CharacterItemsController < Play::BaseController
  before_action :load_character

  def index
    authorize! :read, CharacterItem
    @items = @character.character_items.includes(:provenance_zone).order(received_at: :desc)
  end

  def show
    @item = @character.character_items.find(params[:id])
    authorize! :read, @item
  end

  private

  def load_character
    @character = current_user.characters.find(params[:character_id])
  end
end
