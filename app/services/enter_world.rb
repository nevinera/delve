# Puts a character into a world: picks the version they'll play (keeping
# theirs while it's available, otherwise the newest release), works out
# where they enter (their last connection point if it still exists in that
# version, otherwise the version's default entry point), records both on
# their WorldCharacter, and joins that zone.
class EnterWorld
  Error = WorldEntryPoint::Error
  NoReleasedVersion = WorldEntryPoint::NoReleasedVersion
  NoEntryPoint = WorldEntryPoint::NoEntryPoint
  ClassNotReady = Class.new(Error)

  Result = Data.define(:world_character, :zone, :owned_zone_items, :held_flags, :join, :provenance_restrictions)

  def self.call(...) = new(...).call

  def initialize(character:, world:)
    @character = character
    @world = world
  end

  def call
    world_character = WorldCharacter.find_or_create_by!(world: @world, character: @character)
    grant_trainee_gear(world_character)
    entry = WorldEntryPoint.call(world_character:, world: @world)
    version, zone, connection_key, zone_data = entry.to_h.values_at(:version, :zone, :connection_key, :zone_data)
    world_character.update!(world_version: version, zone_identifier: zone.identifier,
      connection_key:, last_played_at: Time.current)
    join(world_character, zone, zone_data)
  end

  private

  def join(world_character, zone, zone_data)
    owned_zone_items = world_character.owned_zone_items_for(zone_data)
    held_flags = world_character.held_zone_flags_for(zone_data)
    join = JoinWorldZone.call(world_character:, zone:, zone_data:, owned_zone_items:, held_flags:)
    Result.new(world_character:, zone:, owned_zone_items:, held_flags:, join:,
      provenance_restrictions: ProvenanceRestrictions.payload_for_world_zone(world_character.world_version, zone_data))
  end

  # A world character starts with trainee gear the first time they enter
  # (one that's never received anything; hiding a world also creates a
  # WorldCharacter, before any entry).
  def grant_trainee_gear(world_character)
    return if world_character.character_items.exists?
    TraineeGear::GrantInitialEquipment.call(world_character:)
  rescue TraineeGear::GrantInitialEquipment::ClassContentNotReady
    raise ClassNotReady, "#{@character.name}'s class is still loading; try again in a moment."
  end
end
