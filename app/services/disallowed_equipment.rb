# The equipped items of a world character that the zone they'd enter
# disallows (provenance restrictions of the world and zone). Returns [] when
# the world has no released version or entry point.
class DisallowedEquipment
  def self.call(...) = new(...).call

  def initialize(world_character:, world:)
    @world_character = world_character
    @world = world
  end

  def call
    entry = WorldEntryPoint.call(world_character: @world_character, world: @world)
    payload = ProvenanceRestrictions.payload_for_world_zone(entry.version, entry.zone_data)
    restrictions = ProvenanceRestrictions.new(layers: payload[:layers], own_world_key: payload[:world_key])
    equipped = @world_character.equipped_items.includes(character_item: {world_version: :world}).map(&:character_item)
    equipped.reject { |item| restrictions.allows?(item) }
  rescue WorldEntryPoint::NoReleasedVersion, WorldEntryPoint::NoEntryPoint
    []
  end
end
