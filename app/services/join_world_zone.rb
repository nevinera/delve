# Joins a character to one zone of a world (see EnterWorld, which picks the
# zone and connection): a world-mode slot request whose instance is shared
# only with other players in the same imported zone, spawning at the
# character's connection point, with the zone's world-linked exits, and the
# character's active quests and the world's quests file.
class JoinWorldZone < JoinZone
  def initialize(world_character:, zone:, zone_data:, owned_zone_items:, held_flags: [])
    super(character: world_character.character, zone:)
    @world_character = world_character
    @zone_data = zone_data
    @owned_zone_items = owned_zone_items
    @held_flags = held_flags
  end

  private

  def version = @zone.world_version

  def build_attrs
    character_attrs.merge(zone_attrs, world_attrs).tap do |attrs|
      attrs[:expires_at] = version.expires_at.iso8601 if version.expires_at
    end
  end

  def zone_attrs
    {
      zone_identifier: @zone.identifier,
      version: version.commit_sha,
      database_id: @zone.id.to_s,
      source_url: version.zone_url(@zone),
      zone_config: @zone_data,
      exits: @zone.exits
    }
  end

  def world_attrs
    {
      owned_zone_items: @owned_zone_items,
      held_flags: @held_flags,
      active_quests:,
      equipped_items: EquippedItems::ForWorldCharacter.call(world_character: @world_character),
      mode: "world",
      instance_key: "world:#{@zone.id}",
      spawn_at: @world_character.connection_key,
      world_character_database_id: @world_character.id.to_s,
      world_version_id: version.id.to_s,
      provenance_restrictions: ProvenanceRestrictions.payload_for_world_zone(version, @zone_data)
    }.merge(quests_attrs)
  end

  def active_quests = @world_character.character_quests.includes(:quest_progresses).order(:created_at).map { |q| CharacterQuestJson.call(q) }

  # Where the game server reads the world's quests (see plans/quests.md).
  def quests_attrs
    return {} unless version.quests_path
    {quests_url: version.quests_url, quests_sha: version.quests_sha}
  end
end
