class AwardCharacterItem
  include Memery

  Error = Class.new(StandardError)
  ZoneMismatch = Class.new(Error)
  MissingField = Class.new(Error)

  def self.call(...) = new(...).call

  def initialize(character:, source_data:, upgrade_only: false)
    @character = character
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
    validate_zone!
    validate_required_fields!
  end

  memoize def already_held? = existing_record.present?

  memoize def already_held_other_version?
    @character.character_items
      .joins(:provenance_zone)
      .where(identifier:)
      .where(zones: {identifier: zone_identifier})
      .where.not(source_key:)
      .exists?
  end

  private

  memoize def record = existing_record || built_item.tap(&:save!)

  memoize def existing_record = @character.character_items.find_by(source_key:)

  memoize def zone = Zone.find(zone_db_id)

  def validate_zone!
    return if zone.identifier == zone_identifier && zone.version == zone_version

    raise ZoneMismatch,
      "zone #{zone_db_id} has identifier/version #{zone.identifier}/#{zone.version}, " \
      "request sent #{zone_identifier}/#{zone_version}"
  end

  def validate_required_fields!
    %w[identifier name slot elvl].each do |field|
      raise(MissingField, "Require field '#{field}' missing") unless @source_data.key?(field)
    end
  end

  memoize def source_key = "#{zone.identifier}/#{zone.version}/#{identifier}"

  memoize def built_item = CharacterItem.new(provenance_attributes.merge(item_attributes))

  def provenance_attributes
    {
      character: @character,
      provenance_zone: zone,
      source_key:,
      source_json: @source_data,
      identifier:,
      zone_identifier: zone_identifier,
      version: zone_version,
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

  def zone_version = @source_data.dig("zone", "version").to_s

  def identifier = @source_data.fetch("identifier").to_s

  def name = @source_data.fetch("name").to_s

  def slot = @source_data.fetch("slot").to_s

  def elvl = @source_data.fetch("elvl").to_i

  def description = @source_data["description"]&.to_s
end
