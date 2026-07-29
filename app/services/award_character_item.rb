class AwardCharacterItem
  include Memery

  Error = Class.new(StandardError)
  ZoneMismatch = Class.new(Error)
  MissingField = Class.new(Error)

  STAT_TYPES = CharacterItem::STAT_COLUMNS.map { |c| [c.to_s, :to_i] }.to_h.merge("weapon_dps" => :to_f).freeze

  def self.call(...) = new(...).call

  def initialize(character:, source_data:)
    @character = character
    @source_data = source_data
  end

  def call
    validate!
    return nil if already_held?

    record
  end

  def validate!
    validate_zone!
    validate_required_fields!
  end

  memoize def already_held? = existing_record.present?

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
    %w[identifier name slot ilvl].each do |field|
      raise(MissingField, "Require field '#{field}' missing") unless @source_data.key?(field)
    end
  end

  memoize def source_key = "#{zone.identifier}/#{zone.version}/#{identifier}"

  memoize def built_item
    CharacterItem.new(
      character: @character,
      provenance_zone: zone,
      source_key:,
      source_json: @source_data,
      identifier:,
      name:,
      slot:,
      ilvl:,
      description:,
      icon_url:,
      received_at: Time.current.utc,
      **stats
    )
  end

  memoize def raw_stats = @source_data["stats"] || {}

  def stat_value(name, raw_value) = raw_value&.public_send(STAT_TYPES[name])

  memoize def stats
    raw_stats.slice(*STAT_TYPES.keys).to_h do |name, raw_value|
      [name.to_sym, stat_value(name, raw_value)]
    end
  end

  def zone_db_id = @source_data.dig("zone", "database_id").to_s

  def zone_identifier = @source_data.dig("zone", "identifier").to_s

  def zone_version = @source_data.dig("zone", "version").to_s

  def identifier = @source_data.fetch("identifier").to_s

  def name = @source_data.fetch("name").to_s

  def slot = @source_data.fetch("slot").to_s

  def ilvl = @source_data.fetch("ilvl").to_i

  def description = @source_data["description"]&.to_s

  def icon_url = @source_data["icon_url"]&.to_s
end
