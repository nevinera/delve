# A character's state in one world: which version they last played, and the
# connection point they last used (where they re-enter). Created the first
# time the character enters the world, or when they hide a world they've
# never entered.
class WorldCharacter < ApplicationRecord
  belongs_to :world
  belongs_to :character
  belongs_to :world_version, optional: true

  validates :character_id, uniqueness: {scope: :world_id}

  scope :active, -> { where(active: true) }

  def position = zone_identifier && connection_key && [zone_identifier, connection_key]
end
