class Play::EquippedItemsController < Play::BaseController
  rescue_from EquipItem::IncompatibleSlot, ActiveRecord::RecordInvalid, ArgumentError, with: :render_unprocessable

  before_action :load_character

  def index
    authorize! :read, EquippedItem
    @equipped_items_by_slot = @world_character.equipped_items.includes(character_item: {world_version: :world}).index_by(&:equipped_slot)
  end

  def update
    authorize! :update, EquippedItem
    character_item_id.present? ? equip : unequip
    respond_to do |format|
      format.html { redirect_to play_character_world_equipped_items_path(@character, @world), notice: "Updated." }
      format.json { render json: EquippedItems::ForWorldCharacter.call(world_character: @world_character) }
    end
  end

  # Equips the best allowed item in every slot (see EquipBestAvailable);
  # `restrictions` is the client's JSON array of provenance layers.
  def best_available
    authorize! :update, EquippedItem
    restrictions = ProvenanceRestrictions.from_json(params[:restrictions].presence || "[]", own_world_key: @world.key)
    EquipBestAvailable.call(world_character: @world_character, restrictions:)
    respond_to do |format|
      format.html { redirect_to play_character_world_equipped_items_path(@character, @world), notice: "Equipped the best available gear." }
      format.json { render json: EquippedItems::ForWorldCharacter.call(world_character: @world_character) }
    end
  end

  private

  def equip
    item = @world_character.character_items.find(character_item_id)
    EquipItem.call(character_item: item, equipped_slot: params[:equipped_slot])
  end

  def unequip
    @world_character.equipped_items.find_by(equipped_slot: params[:equipped_slot])&.destroy!
  end

  def character_item_id = params[:character_item_id].presence

  # Equipment belongs to the character's time in one world.
  def load_character
    @character = current_user.characters.find(params[:character_id])
    @world = World.find(params[:world_id])
    @world_character = @character.world_characters.find_by!(world: @world)
  end

  def render_unprocessable(err)
    respond_to do |format|
      format.html { redirect_to play_character_world_equipped_items_path(@character, @world), alert: err.message }
      format.json { render json: {error: err.message}, status: :unprocessable_content }
    end
  end
end
