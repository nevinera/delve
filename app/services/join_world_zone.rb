# Joins a character to one zone of a world (see EnterWorld, which picks the
# zone and connection): a world-mode slot request whose instance is shared
# only with other players in the same imported zone, spawning at the
# character's connection point, with the zone's world-linked exits.
class JoinWorldZone < JoinZone
  def initialize(world_character:, zone:, zone_data:)
    super(character: world_character.character, zone:)
    @world_character = world_character
    @zone_data = zone_data
  end

  private

  def version = @zone.world_version

  def build_attrs
    character_attrs.merge(
      zone_identifier: @zone.identifier,
      version: version.commit_sha,
      database_id: @zone.id.to_s,
      source_url: version.zone_url(@zone),
      zone_config: @zone_data,
      owned_zone_items: @character.owned_zone_items_for(@zone),
      mode: "world",
      instance_key: "world:#{@zone.id}",
      spawn_at: @world_character.connection_key,
      exits: @zone.exits,
      world_character_database_id: @world_character.id.to_s,
      world_version_id: version.id.to_s
    ).tap do |attrs|
      attrs[:expires_at] = version.expires_at.iso8601 if version.expires_at
    end
  end
end
