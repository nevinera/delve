# Computes an item's stat grants at em = 1.0 (ee = 0) - i.e. before any
# elevation scaling. See docs/stats.md ("Stat points" and "Slots").
module ItemStats
  class Raw
    BASE_PRIMARY = 15.0
    BASE_SECONDARY = 10.0
    PRIMARY_MISSING_BONUS = 0.8
    SECONDARY_MISSING_BONUS = 0.6
    SHIELD_DEFENCE_MULTIPLIER = 2.5

    # factor: slot's point multiplier. primary: whether this slot ever has a
    # primary (false for ring/neck). max_secondaries: how many secondary
    # slots it rolls. base_stamina: whether it grants stamina purely from
    # being an armor slot, independent of itemization.
    SLOT_SHAPES = {
      "head" => {factor: 1.5, primary: true, max_secondaries: 3, base_stamina: true},
      "neck" => {factor: 1.0, primary: false, max_secondaries: 3, base_stamina: false},
      "shoulders" => {factor: 1.0, primary: true, max_secondaries: 2, base_stamina: true},
      "back" => {factor: 1.0, primary: true, max_secondaries: 2, base_stamina: true},
      "chest" => {factor: 1.5, primary: true, max_secondaries: 3, base_stamina: true},
      "wrists" => {factor: 1.0, primary: true, max_secondaries: 2, base_stamina: true},
      "hands" => {factor: 1.0, primary: true, max_secondaries: 2, base_stamina: true},
      "waist" => {factor: 1.0, primary: true, max_secondaries: 2, base_stamina: true},
      "legs" => {factor: 1.5, primary: true, max_secondaries: 3, base_stamina: true},
      "feet" => {factor: 1.0, primary: true, max_secondaries: 2, base_stamina: true},
      "ring" => {factor: 1.0, primary: false, max_secondaries: 2, base_stamina: false},
      "main_hand" => {factor: 2.0, primary: true, max_secondaries: 3, base_stamina: false},
      "off_hand" => {factor: 2.0, primary: true, max_secondaries: 3, base_stamina: false},
      "one_hand" => {factor: 2.0, primary: true, max_secondaries: 3, base_stamina: false},
      "two_hand" => {factor: 4.0, primary: true, max_secondaries: 3, base_stamina: false}
    }.freeze

    def self.call(...) = new(...).call

    def initialize(character_item:)
      @item = character_item
    end

    def call
      stats = Hash.new(0.0)
      add_itemized_stats!(stats)
      add_base_stamina!(stats)
      add_shield_defence!(stats)
      stats
    end

    private

    def shape = SLOT_SHAPES.fetch(@item.slot)

    def shield? = @item.slot == "off_hand" && @item.source_json["shield"] == true

    def primary_slot? = shape[:primary] && !shield?

    def primary_present? = primary_slot? && @item.primary_stat.present?

    def secondaries = @item.secondary_stats

    def missing_secondaries_count = [shape[:max_secondaries] - secondaries.length, 0].max

    def total_bonus_percent
      primary_bonus = (primary_slot? && !primary_present?) ? PRIMARY_MISSING_BONUS : 0.0
      primary_bonus + (missing_secondaries_count * SECONDARY_MISSING_BONUS)
    end

    def filled_count = (primary_present? ? 1 : 0) + secondaries.length

    def bonus_percent_each
      return 0.0 if filled_count.zero?
      total_bonus_percent / filled_count
    end

    def add_itemized_stats!(stats)
      add_primary_stat!(stats)
      secondaries.each { |s| stats[s.to_sym] += BASE_SECONDARY * itemized_multiplier }
    end

    def add_primary_stat!(stats)
      return unless primary_present?
      stats[@item.primary_stat.to_sym] += BASE_PRIMARY * itemized_multiplier
    end

    def itemized_multiplier = (1 + bonus_percent_each) * shape[:factor]

    def add_base_stamina!(stats)
      return unless shape[:base_stamina]
      stats[:stamina] += BASE_SECONDARY * shape[:factor]
    end

    def add_shield_defence!(stats)
      return unless shield?
      stats[:defence_rating] += SHIELD_DEFENCE_MULTIPLIER * BASE_PRIMARY * shape[:factor]
    end
  end
end
