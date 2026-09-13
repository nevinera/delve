# Persists and equips Trainee Gear CharacterItems for every equip slot a
# character doesn't already occupy (real or Trainee), from their class's
# primaryStats/secondaryStats/wields. See docs/stats.md ("Trainee Gear").
# Safe to call on a character with existing gear - already-occupied slots
# are left untouched. Uses batch inserts since it's on the request path.
module TraineeGear
  class GrantInitialEquipment
    include Memery

    # Raised when the character's class hasn't finished fetching/validating
    # its content yet (primary_stats/secondary_stats/wields default to empty
    # arrays until FetchCharacterClassContentJob completes).
    class ClassContentNotReady < StandardError; end

    def self.call(...) = new(...).call

    def initialize(character:)
      @character = character
    end

    def call
      return if items.empty?

      result = CharacterItem.insert_all!(character_item_attrs, returning: %w[id source_key])
      ids_by_source_key = result.rows.to_h { |id, source_key| [source_key, id] }
      EquippedItem.insert_all!(equipped_item_attrs(ids_by_source_key))
    end

    private

    memoize def items
      raise_unless_class_content_ready!
      TraineeGear::Generate.call(
        primary_stats: character_class.primary_stats,
        secondary_stats: character_class.secondary_stats,
        wields: character_class.wields
      ).except(*occupied_slots)
    end

    def occupied_slots = @character.equipped_items.pluck(:equipped_slot)

    def raise_unless_class_content_ready!
      return unless [character_class.primary_stats, character_class.secondary_stats, character_class.wields].any?(&:blank?)
      raise ClassContentNotReady, "#{character_class.identifier} lacks required values for primary_stats, secondary_stats, or wields; ensure FetchCharacterClassContentJob has completed."
    end

    memoize def character_class = @character.character_class

    def source_key_for(equipped_slot) = "trainee/#{equipped_slot}"

    def character_item_attrs
      now = Time.current
      items.map { |equipped_slot, item| character_item_attrs_for(equipped_slot, item, now) }
    end

    def character_item_attrs_for(equipped_slot, item, now)
      {
        character_id: @character.id,
        identifier: "trainee-#{equipped_slot}",
        name: item.name,
        source_key: source_key_for(equipped_slot),
        zone_identifier: "trainee",
        version: "0.0",
        provenance_zone_id: nil,
        slot: item.slot,
        elvl: 0,
        primary_stat: item.primary_stat,
        secondary_stats: item.secondary_stats,
        source_json: {"shield" => item.shield, "weaponType" => item.weapon_type}
      }.merge(timestamps(now, received_at: true))
    end

    def timestamps(now, received_at: false)
      base = {created_at: now, updated_at: now}
      received_at ? base.merge(received_at: now) : base
    end

    def equipped_item_attrs(ids_by_source_key)
      now = Time.current
      items.keys.map do |equipped_slot|
        {
          character_id: @character.id,
          character_item_id: ids_by_source_key.fetch(source_key_for(equipped_slot)),
          equipped_slot: equipped_slot
        }.merge(timestamps(now))
      end
    end
  end
end
