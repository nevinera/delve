# Puts a character into a world: picks the version they'll play (keeping
# theirs while it's available, otherwise the newest release), works out
# where they enter (their last connection point if it still exists in that
# version, otherwise the version's default entry point), records both on
# their WorldCharacter, and joins that zone.
class EnterWorld
  Error = Class.new(StandardError)
  NoReleasedVersion = Class.new(Error)
  NoEntryPoint = Class.new(Error)
  ClassNotReady = Class.new(Error)

  Result = Data.define(:world_character, :zone, :owned_zone_items, :join, :provenance_restrictions)

  def self.call(...) = new(...).call

  def initialize(character:, world:)
    @character = character
    @world = world
  end

  def call
    world_character = WorldCharacter.find_or_create_by!(world: @world, character: @character)
    grant_trainee_gear(world_character)
    version = playable_version(world_character)
    zone, connection_key, zone_data = entry(world_character, version)
    world_character.update!(world_version: version, zone_identifier: zone.identifier,
      connection_key:, last_played_at: Time.current)
    owned_zone_items = world_character.owned_zone_items_for(zone_data)
    join = JoinWorldZone.call(world_character:, zone:, zone_data:, owned_zone_items:)
    Result.new(world_character:, zone:, owned_zone_items:, join:,
      provenance_restrictions: ProvenanceRestrictions.payload_for_world_zone(version, zone_data))
  end

  private

  # A world character starts with trainee gear the first time they enter
  # (one that's never received anything; hiding a world also creates a
  # WorldCharacter, before any entry).
  def grant_trainee_gear(world_character)
    return if world_character.character_items.exists?
    TraineeGear::GrantInitialEquipment.call(world_character:)
  rescue TraineeGear::GrantInitialEquipment::ClassContentNotReady
    raise ClassNotReady, "#{@character.name}'s class is still loading; try again in a moment."
  end

  def playable_version(world_character)
    current = world_character.world_version
    return current if current&.released? && !current.expired?
    @world.released_versions.first || raise(NoReleasedVersion, "#{@world.name || @world.key} has no released version")
  end

  # [zone, connection_key, zone_data] to enter at. The zone's file is read
  # either way, since it's handed to the game server.
  def entry(world_character, version)
    saved = saved_entry(world_character, version)
    return saved if saved

    zone = version.zones.where.not(entry_connection_key: nil).first
    raise NoEntryPoint, "#{version.ref} has no entry point" unless zone
    [zone, zone.entry_connection_key, WorldContent.zone(zone)]
  end

  def saved_entry(world_character, version)
    zone_key, connection_key = world_character.position
    zone = zone_key && version.zones.find_by(identifier: zone_key)
    return unless zone

    zone_data = WorldContent.zone(zone)
    [zone, connection_key, zone_data] if WorldContent::Links.connection_exists?(zone_data, connection_key)
  end
end
