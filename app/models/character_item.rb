class CharacterItem < ApplicationRecord
  SLOTS = %w[head neck shoulders back chest wrists hands waist legs feet ring main_hand off_hand one_hand two_hand].freeze
  PRIMARY_STATS = %w[strength agility intellect].freeze
  SECONDARY_STATS = %w[stamina crit_rating haste_rating mastery_rating versatility_rating defence_rating recovery_rating].freeze

  belongs_to :character
  belongs_to :provenance_zone, class_name: "Zone", optional: true
  has_one :equipped_item, dependent: :destroy

  validates :source_key, presence: true
  validates :identifier, presence: true
  validates :name, presence: true
  validates :elvl, presence: true, numericality: {only_integer: true, greater_than_or_equal_to: 0}
  validates :slot, presence: true, inclusion: {in: SLOTS}
  validates :received_at, presence: true
  validates :source_json, presence: true
  validates :source_key, uniqueness: {scope: :character_id}
  validates :primary_stat, inclusion: {in: PRIMARY_STATS}, allow_nil: true
  validate :secondary_stats_are_valid

  private

  def secondary_stats_are_valid
    unless secondary_stats.is_a?(Array)
      errors.add(:secondary_stats, "must be an array")
      return
    end
    invalid = secondary_stats - SECONDARY_STATS
    errors.add(:secondary_stats, "contains unrecognized values: #{invalid.join(", ")}") if invalid.any?
  end
end
