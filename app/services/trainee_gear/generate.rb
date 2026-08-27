# Synthesizes a Trainee Gear item for every equip slot a class can fill, from
# its primaryStats/secondaryStats/wields. See docs/stats.md ("Trainee Gear").
# Deterministic - the same class inputs always produce the same gear.
module TraineeGear
  class Generate
    Item = Data.define(:equipped_slot, :slot, :name, :primary_stat, :secondary_stats, :shield, :wield)

    # Which rank (0-indexed into primary_stats) each primary-bearing equip
    # slot uses, keyed by how many primary stats the class has.
    PRIMARY_RANKS = {
      1 => {
        "main_hand" => 0,
        "off_hand" => 0,
        "head" => 0,
        "shoulders" => 0,
        "back" => 0,
        "chest" => 0,
        "wrists" => 0,
        "hands" => 0,
        "waist" => 0,
        "legs" => 0,
        "feet" => 0
      }.freeze,
      2 => {
        "main_hand" => 0,
        "off_hand" => 0,
        "head" => 0,
        "shoulders" => 1,
        "back" => 0,
        "chest" => 1,
        "wrists" => 0,
        "hands" => 1,
        "waist" => 0,
        "legs" => 1,
        "feet" => 0
      }.freeze,
      3 => {
        "main_hand" => 0,
        "off_hand" => 0,
        "head" => 1,
        "shoulders" => 1,
        "back" => 0,
        "chest" => 2,
        "wrists" => 1,
        "hands" => 0,
        "waist" => 1,
        "legs" => 0,
        "feet" => 2
      }.freeze
    }.freeze

    # Which ranks (0-indexed into secondary_stats) each equip slot carries.
    SECONDARY_RANKS = {
      "head" => [0, 1, 2],
      "neck" => [0, 1, 2],
      "shoulders" => [1, 3],
      "back" => [0, 1],
      "chest" => [0, 1, 2],
      "wrists" => [0, 3],
      "hands" => [0, 4],
      "ring_1" => [0, 2],
      "ring_2" => [1, 3],
      "waist" => [0, 3],
      "legs" => [0, 1, 2],
      "feet" => [0, 4],
      "main_hand" => [0, 1, 2],
      "off_hand" => [0, 1, 2]
    }.freeze

    ITEM_SLOTS = {"ring_1" => "ring", "ring_2" => "ring"}.freeze

    def self.call(...) = new(...).call

    def initialize(primary_stats:, secondary_stats:, wields:)
      @primary_stats = primary_stats
      @secondary_stats = secondary_stats
      @wields = wields
    end

    def call
      EquippedItem::EQUIPPED_SLOTS.each_with_object({}) do |equipped_slot, hash|
        next if equipped_slot == "off_hand" && two_handed?
        hash[equipped_slot] = item_for(equipped_slot)
      end
    end

    private

    def two_handed? = @wields.length == 1

    def type_for(slot) = ITEM_SLOTS.fetch(slot, slot)

    def item_for(equipped_slot)
      return weapon_item_for(equipped_slot) if %w[main_hand off_hand].include?(equipped_slot)

      Item.new(
        equipped_slot: equipped_slot,
        slot: type_for(equipped_slot),
        name: name_for(equipped_slot),
        primary_stat: primary_stat_for(equipped_slot),
        secondary_stats: secondary_stats_for(equipped_slot),
        shield: false,
        wield: nil
      )
    end

    def weapon_item_for(equipped_slot)
      wield = (equipped_slot == "main_hand") ? @wields[0] : @wields[1]
      shield = wield == "shield"
      Item.new(
        equipped_slot: equipped_slot,
        slot: weapon_slot_for(equipped_slot),
        name: name_for(equipped_slot),
        primary_stat: shield ? nil : primary_stat_for(equipped_slot),
        secondary_stats: secondary_stats_for(equipped_slot),
        shield: shield,
        wield: wield
      )
    end

    def weapon_slot_for(equipped_slot)
      return "two_hand" if equipped_slot == "main_hand" && two_handed?
      return "off_hand" if equipped_slot == "off_hand"
      "one_hand"
    end

    def primary_stat_for(equipped_slot)
      rank = PRIMARY_RANKS.fetch(@primary_stats.length).fetch(equipped_slot, nil)
      rank && @primary_stats[rank]
    end

    def secondary_stats_for(equipped_slot)
      SECONDARY_RANKS.fetch(equipped_slot).map { |rank| @secondary_stats[rank] }
    end

    def name_for(equipped_slot)
      "Trainee #{EquippedItem::SLOT_LABELS.fetch(equipped_slot)}"
    end
  end
end
