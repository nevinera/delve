# Equips, in every slot, the allowed item with the highest elvl (ties go to
# the alphabetically first name, then identifier). A slot with no allowed
# item is emptied. Disallowed items are never chosen, wherever they are now.
class EquipBestAvailable
  def self.call(...) = new(...).call

  def initialize(world_character:, restrictions:)
    @world_character = world_character
    @restrictions = restrictions
  end

  def call
    ActiveRecord::Base.transaction do
      @world_character.equipped_items.destroy_all
      choose_items.each { |slot, item| EquipItem.call(character_item: item, equipped_slot: slot) }
    end
  end

  private

  def choose_items
    remaining = candidates
    EquippedItem::EQUIPPED_SLOTS.each_with_object({}) do |slot, chosen|
      item = remaining.find { |candidate| EquippedItem::SLOT_COMPATIBILITY[candidate.slot].include?(slot) }
      next unless item
      remaining -= [item]
      chosen[slot] = item
    end
  end

  def candidates
    @world_character.character_items.includes(world_version: :world)
      .select { |item| @restrictions.allows?(item) }
      .sort_by { |item| [-item.elvl, item.name, item.identifier] }
  end
end
