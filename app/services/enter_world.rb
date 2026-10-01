# Puts a character into a world: picks the version they'll play (keeping
# theirs while it's available, otherwise the newest release), works out
# where they enter (their last connection point if it still exists in that
# version, otherwise the world's default entry point), records both on
# their WorldCharacter, and joins that zone.
class EnterWorld
  Error = Class.new(StandardError)
  NoReleasedVersion = Class.new(Error)
  NoEntryPoint = Class.new(Error)

  Result = Data.define(:world_character, :zone, :join)

  def self.call(...) = new(...).call

  def initialize(character:, world:)
    @character = character
    @world = world
  end

  def call
    world_character = WorldCharacter.find_or_create_by!(world: @world, character: @character)
    version = playable_version(world_character)
    world_data = WorldContent.world(version)
    zone, connection_key, zone_data = entry(world_character, version, world_data)
    world_character.update!(world_version: version, zone_identifier: zone.identifier,
      connection_key:, last_played_at: Time.current)
    join = JoinWorldZone.call(world_character:, zone:, zone_data:, world_data:)
    Result.new(world_character:, zone:, join:)
  end

  private

  def playable_version(world_character)
    current = world_character.world_version
    return current if current&.released? && !current.expired?
    @world.released_versions.first || raise(NoReleasedVersion, "#{@world.key} has no released version")
  end

  # [zone, connection_key, zone_data] to enter at.
  def entry(world_character, version, world_data)
    saved = saved_entry(world_character, version)
    return saved if saved

    zone_key, connection_key = WorldContent::Links.default_entry(world_data)
    raise NoEntryPoint, "#{@world.key} has no entry point without a key" unless zone_key
    zone = version.zones.find_by!(identifier: zone_key)
    [zone, connection_key, WorldContent.zone(zone)]
  end

  def saved_entry(world_character, version)
    zone_key, connection_key = world_character.position
    zone = zone_key && version.zones.find_by(identifier: zone_key)
    return unless zone

    zone_data = WorldContent.zone(zone)
    [zone, connection_key, zone_data] if WorldContent::Links.connection_exists?(zone_data, connection_key)
  end
end
