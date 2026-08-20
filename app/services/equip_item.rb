class EquipItem
  include Memery

  Error = Class.new(StandardError)
  IncompatibleSlot = Class.new(Error)

  def self.call(...) = new(...).call

  def initialize(character_item:, equipped_slot:)
    @character_item = character_item
    @equipped_slot = equipped_slot
  end

  def call
    validate!
    return previous_placement if already_equipped_here?

    ActiveRecord::Base.transaction do
      previous_placement&.destroy!
      slot_occupant&.destroy!
      EquippedItem.create!(character: character, character_item: @character_item, equipped_slot: @equipped_slot)
    end
  end

  private

  def validate!
    return if EquippedItem::SLOT_COMPATIBILITY[@character_item.slot]&.include?(@equipped_slot)

    raise IncompatibleSlot, "cannot equip a #{@character_item.slot} item into #{@equipped_slot}"
  end

  def already_equipped_here? = previous_placement&.equipped_slot == @equipped_slot

  def character = @character_item.character

  memoize def previous_placement = @character_item.equipped_item

  memoize def slot_occupant = EquippedItem.find_by(character: character, equipped_slot: @equipped_slot)
end
