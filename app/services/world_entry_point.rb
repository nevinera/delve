# Where a world character would enter a world: the version they'd play
# (keeping theirs while it's available, otherwise the newest release) and
# the zone/connection (their last one if it still exists in that version,
# otherwise the version's default entry point). Read-only.
class WorldEntryPoint
  Error = Class.new(StandardError)
  NoReleasedVersion = Class.new(Error)
  NoEntryPoint = Class.new(Error)

  Result = Data.define(:version, :zone, :connection_key, :zone_data)

  def self.call(...) = new(...).call

  def initialize(world_character:, world:)
    @world_character = world_character
    @world = world
  end

  def call
    version = playable_version
    zone, connection_key, zone_data = entry(version)
    Result.new(version:, zone:, connection_key:, zone_data:)
  end

  private

  def playable_version
    current = @world_character.world_version
    return current if current&.released? && !current.expired?
    @world.released_versions.first || raise(NoReleasedVersion, "#{@world.name || @world.key} has no released version")
  end

  # [zone, connection_key, zone_data]. The zone's file is read either way,
  # since it's handed to the game server.
  def entry(version)
    saved = saved_entry(version)
    return saved if saved

    zone = version.zones.where.not(entry_connection_key: nil).first
    raise NoEntryPoint, "#{version.ref} has no entry point" unless zone
    [zone, zone.entry_connection_key, WorldContent.zone(zone)]
  end

  def saved_entry(version)
    zone_key, connection_key = @world_character.position
    zone = zone_key && version.zones.find_by(identifier: zone_key)
    return unless zone

    zone_data = WorldContent.zone(zone)
    [zone, connection_key, zone_data] if WorldContent::Links.connection_exists?(zone_data, connection_key)
  end
end
