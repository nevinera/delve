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

  validates :character_id, uniqueness: {scope: :world_id}

  scope :active, -> { where(active: true) }

  def position = zone_identifier && connection_key && [zone_identifier, connection_key]

  # For each item this world character holds from zone, whether they hold
  # its current definition (true) or an older one (false) - the game
  # server's owned_zone_items. zone_data is the zone's parsed file.
  def owned_zone_items_for(zone, zone_data)
    definitions = zone_data["items"] || {}
    character_items.where(zone_identifier: zone.identifier).each_with_object({}) do |item, owned|
      definition = definitions[item.identifier]
      owned[item.identifier] ||= definition.present? && item.version == ItemDefinition.version(definition)
    end
  end
end
