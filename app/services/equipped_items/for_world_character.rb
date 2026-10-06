# A world character's equipped items as the game server and client expect
# them, keyed by equipped slot (see EquippedItems.item_json).
class EquippedItems::ForWorldCharacter
  def self.call(...) = new(...).call

  def initialize(world_character:)
    @world_character = world_character
  end

  def call
    @world_character.equipped_items.includes(character_item: {world_version: :world}).each_with_object({}) do |equipped_item, hash|
      hash[equipped_item.equipped_slot] = EquippedItems.item_json(equipped_item.character_item)
    end
  end
end
