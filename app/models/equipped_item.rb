class EquippedItem < ApplicationRecord
  EQUIPPED_SLOTS = %w[head neck shoulders back chest wrists hands waist legs feet
    ring_1 ring_2 trinket_1 trinket_2 main_hand off_hand].freeze

  SLOT_LABELS = {
    "head" => "Head",
    "neck" => "Neck",
    "shoulders" => "Shoulders",
    "back" => "Back",
    "chest" => "Chest",
    "wrists" => "Wrists",
    "hands" => "Hands",
    "waist" => "Waist",
    "legs" => "Legs",
    "feet" => "Feet",
    "ring_1" => "Left Ring",
    "ring_2" => "Right Ring",
    "trinket_1" => "Left Trinket",
    "trinket_2" => "Right Trinket",
    "main_hand" => "Main Hand",
    "off_hand" => "Off Hand"
  }.freeze

  SLOT_COMPATIBILITY = {
    "head" => %w[head],
    "neck" => %w[neck],
    "shoulders" => %w[shoulders],
    "back" => %w[back],
    "chest" => %w[chest],
    "wrists" => %w[wrists],
    "hands" => %w[hands],
    "waist" => %w[waist],
    "legs" => %w[legs],
    "feet" => %w[feet],
    "ring" => %w[ring_1 ring_2],
    "trinket" => %w[trinket_1 trinket_2],
    "main_hand" => %w[main_hand],
    "off_hand" => %w[off_hand],
    "one_hand" => %w[main_hand off_hand],
    "two_hand" => %w[main_hand]
  }.freeze

  SLOT_TYPES = {
    "ring_1" => ["ring"],
    "ring_2" => ["ring"],
    "trinket_1" => ["trinket"],
    "trinket_2" => ["trinket"],
    "main_hand" => %w[main_hand one_hand two_hand],
    "off_hand" => %w[off_hand one_hand]
  }.freeze

  def self.item_slots_for(equipped_slot) = SLOT_TYPES.fetch(equipped_slot, [equipped_slot])

  belongs_to :character
  belongs_to :character_item

  validates :equipped_slot, presence: true, inclusion: {in: EQUIPPED_SLOTS}
  validates :equipped_slot, uniqueness: {scope: :character_id}
  validates :character_item_id, uniqueness: true
  validate :slot_compatible_with_item

  private

  def slot_compatible_with_item
    return unless character_item && equipped_slot.present?
    allowed = SLOT_COMPATIBILITY[character_item.slot]
    return if allowed&.include?(equipped_slot)
    errors.add(:equipped_slot, "is not compatible with item slot '#{character_item.slot}'")
  end
end
