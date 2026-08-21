class EquippedItems::ForCharacter
  def self.call(...) = new(...).call

  def initialize(character:)
    @character = character
  end

  def call
    @character.equipped_items.includes(:character_item).each_with_object({}) do |equipped_item, hash|
      hash[equipped_item.equipped_slot] = provenance(equipped_item.character_item)
    end
  end

  private

  def provenance(item)
    {
      identifier: item.identifier,
      source_key: item.source_key,
      zone_identifier: item.zone_identifier,
      version: item.version,
      ilvl: item.ilvl,
      stats: item.stats_hash
    }
  end
end
