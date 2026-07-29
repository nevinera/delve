class CharacterItem < ApplicationRecord
  SLOTS = %w[head neck shoulders back chest wrists hands waist legs feet ring trinket main_hand off_hand one_hand two_hand].freeze
  STAT_COLUMNS = %i[strength agility intellect stamina crit_rating haste_rating mastery_rating versatility_rating resilience_rating].freeze

  belongs_to :character
  belongs_to :provenance_zone, class_name: "Zone"

  validates :source_key, presence: true
  validates :identifier, presence: true
  validates :name, presence: true
  validates :ilvl, presence: true, numericality: {only_integer: true, greater_than_or_equal_to: 0}
  validates :slot, presence: true, inclusion: {in: SLOTS}
  validates :received_at, presence: true
  validates :source_json, presence: true
  validates :source_key, uniqueness: {scope: :character_id}
  validates :weapon_dps, numericality: {greater_than: 0}, allow_nil: true

  STAT_COLUMNS.each do |stat|
    validates stat, numericality: {only_integer: true, greater_than_or_equal_to: 0}, allow_nil: true
    define_method(stat) { self[stat] || 0 }
  end
end
