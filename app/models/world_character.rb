# A character's state in one world: which version they last played, and the
# connection point they last used (where they re-enter). Created the first
# time the character enters the world, or when they hide a world they've
# never entered.
class WorldCharacter < ApplicationRecord
  belongs_to :world
  belongs_to :character
  belongs_to :world_version, optional: true
  has_many :character_items, dependent: :destroy
  has_many :equipped_items, dependent: :destroy
  has_many :character_flags, dependent: :destroy

  validates :character_id, uniqueness: {scope: :world_id}

  scope :active, -> { where(active: true) }

  def position = zone_identifier && connection_key && [zone_identifier, connection_key]

  # For each of zone's items this world character holds, whether they hold
  # its current definition (true) or an older one (false) - the game
  # server's owned_zone_items. zone_data is the zone's parsed file. Items
  # are identified within the world, so one picked up in another zone
  # counts here too.
  def owned_zone_items_for(zone_data)
    definitions = zone_data["items"] || {}
    character_items.where(identifier: definitions.keys).each_with_object({}) do |item, owned|
      definition = definitions[item.identifier]
      owned[item.identifier] ||= definition.present? && item.version == ItemDefinition.version(definition)
    end
  end

  # The flags in zone_data's "flags" list (the ones the zone preloads) that
  # this world character holds.
  def held_zone_flags_for(zone_data) = CharacterFlag.held(self, zone_data["flags"])
end
