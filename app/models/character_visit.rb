# Somewhere a character has been in a world (see plans/map-visits.md): a
# zone (blank map and place), a map in it (blank place), or a place on that
# map. The in-game map shows what's been visited. Like flags, visits belong
# to the world, not a version; world_version is the one first visited under.
class CharacterVisit < ApplicationRecord
  IDENTIFIER_FORMAT = /\A[A-Za-z0-9_-]{1,64}\z/

  belongs_to :world_character
  belongs_to :world_version, optional: true

  validates :zone_identifier, format: {with: IDENTIFIER_FORMAT}
  validates :map_identifier, format: {with: IDENTIFIER_FORMAT}, allow_blank: true
  validates :place_identifier, format: {with: IDENTIFIER_FORMAT}, allow_blank: true
  validates :place_identifier, absence: {message: "needs a map"}, if: -> { map_identifier.blank? }

  # Records the visit under world_character's current version. A no-op
  # (keeping the first visit's version) when it's already recorded. Raises
  # ActiveRecord::RecordInvalid for invalid identifiers.
  def self.record!(world_character, zone:, map: "", place: "")
    visit = new(world_character:, zone_identifier: zone.to_s, map_identifier: map.to_s, place_identifier: place.to_s)
    visit.validate!
    create_with(world_version_id: world_character.world_version_id)
      .create_or_find_by!(visit.attributes.slice("world_character_id", "zone_identifier", "map_identifier", "place_identifier"))
  end

  # {map:, place:} for each of world_character's visits in the zone, the
  # zone's own visit included (both blank).
  def self.in_zone(world_character, zone_identifier)
    where(world_character:, zone_identifier:).order(:id)
      .pluck(:map_identifier, :place_identifier).map { |map, place| {map:, place:} }
  end
end
