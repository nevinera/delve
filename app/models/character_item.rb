class CharacterItem < ApplicationRecord
  SLOTS = %w[head neck shoulders back chest wrists hands waist legs feet ring main_hand off_hand one_hand two_hand].freeze
  PRIMARY_STATS = %w[strength agility intellect].freeze
  SECONDARY_STATS = %w[stamina crit_rating haste_rating mastery_rating versatility_rating defence_rating recovery_rating].freeze

  belongs_to :world_character
  # The world version it was acquired in; nil for trainee gear.
  belongs_to :world_version, optional: true
  has_one :equipped_item, dependent: :destroy

  delegate :character, to: :world_character

  validates :identifier, presence: true
  validates :name, presence: true
  validates :elvl, presence: true, numericality: {only_integer: true, greater_than_or_equal_to: 0}
  validates :slot, presence: true, inclusion: {in: SLOTS}
  validates :source_json, presence: true
  validates :version, presence: true,
    uniqueness: {scope: [:world_character_id, :identifier], message: "is already held"}
  validates :primary_stat, inclusion: {in: PRIMARY_STATS}, allow_nil: true
  validate :secondary_stats_are_valid

  # Where it came from, for display: the world and version it was acquired
  # in, or "Trainee gear".
  def provenance_label
    return "Trainee gear" unless world_version
    "#{world_version.world.name || world_version.world.key} (#{world_version.ref})"
  end

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
