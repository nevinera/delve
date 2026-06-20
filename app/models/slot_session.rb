class SlotSession < ApplicationRecord
  belongs_to :character
  belongs_to :zone

  validates :token, presence: true
  validates :instance_identifier, presence: true
  validates :slot_id, presence: true
  validates :character_id, uniqueness: true
end
