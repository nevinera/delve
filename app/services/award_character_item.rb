# Awards a looted item to a world character (from the game server - see
# InternalApi::CharacterItemsController). An item is identified within the
# world by its zone and identifier; its version is a hash of its definition
# (see ItemDefinition), so holding an older definition of the same item
# makes this an upgrade.
class AwardCharacterItem
  include Memery

  Error = Class.new(StandardError)
  ZoneMismatch = Class.new(Error)
  MissingField = Class.new(Error)

  def self.call(...) = new(...).call

  def initialize(world_character:, source_data:, upgrade_only: false)
    @world_character = world_character
    @source_data = source_data
    @upgrade_only = upgrade_only
  end

  def call
    validate!
    return :already_owned_this_version if already_held?
    return :not_an_upgrade if @upgrade_only && !already_held_other_version?

    already_held_other_version? ? [record, :already_owned_other_version] : record
  end

  def validate!
    validate_required_fields!
    validate_zone!
  end

  memoize def already_held? = existing_record.present?

  memoize def already_held_other_version?
    @world_character.character_items
      .where(zone_identifier: zone.identifier, identifier:)
      .where.not(version:)
      .exists?
  end

  private

  memoize def record = existing_record || built_item.tap(&:save!)

  memoize def existing_record =
    @world_character.character_items.find_by(zone_identifier: zone.identifier, identifier:, version:)

  # The zone must be one of the world character's current version's zones.
  memoize def zone
    version = @world_character.world_version
    zone = version&.zones&.find_by(id: zone_db_id)
    return zone if zone && zone.identifier == zone_identifier

    raise ZoneMismatch,
      "zone #{zone_db_id} (#{zone_identifier}) isn't in world character #{@world_character.id}'s current world version"
  end

  def validate_zone! = zone

  def validate_required_fields!
    %w[identifier name slot elvl].each do |field|
      raise(MissingField, "Require field '#{field}' missing") unless @source_data.key?(field)
    end
  end

  memoize def definition = ItemDefinition.normalize(@source_data)

  memoize def version = ItemDefinition.version(definition)

  memoize def built_item = CharacterItem.new(provenance_attributes.merge(item_attributes))

  def provenance_attributes
    {
      world_character: @world_character,
      source_json: definition,
      identifier:,
      zone_identifier: zone.identifier,
      version:,
      received_at: Time.current.utc
    }
  end

  def item_attributes
    {name:, slot:, elvl:, description:, primary_stat:, secondary_stats:}
  end

  def primary_stat = @source_data["primary"]

  def secondary_stats = Array(@source_data["secondaries"])

  def zone_db_id = @source_data.dig("zone", "database_id").to_s

  def zone_identifier = @source_data.dig("zone", "identifier").to_s

  def identifier = @source_data.fetch("identifier").to_s

  def name = @source_data.fetch("name").to_s

  def slot = @source_data.fetch("slot").to_s

  def elvl = @source_data.fetch("elvl").to_i

  def description = @source_data["description"]&.to_s
end
