require "net/http"

class JoinZone
  Result = Data.define(:token, :instance_identifier, :slot_id)

  def self.call(...) = new(...).call

  def initialize(character:, zone:, instance_identifier: nil)
    @character = character
    @zone = zone
    @instance_identifier = instance_identifier
  end

  def call
    response = GameApi.slots.request(build_attrs)
    session = upsert_session(response)
    Result.new(
      token: session.token,
      instance_identifier: session.instance_identifier,
      slot_id: session.slot_id
    )
  end

  private

  def build_attrs
    attrs = {
      zone_identifier: @zone.identifier,
      version: @zone.version,
      database_id: @zone.id.to_s,
      source_url: @zone.config_url,
      zone_config: fetch_json(@zone.config_url),
      character_name: @character.name,
      character_class: fetch_json(@character.character_class.location)
    }
    attrs[:instance_identifier] = @instance_identifier if @instance_identifier
    attrs
  end

  def fetch_json(url)
    response = Net::HTTP.get_response(URI(url))
    raise "Failed to fetch #{url}: HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)
    JSON.parse(response.body)
  end

  def upsert_session(response)
    session = SlotSession.find_or_initialize_by(character: @character)
    session.update!(
      zone: @zone,
      token: response["token"],
      instance_identifier: response["instance_identifier"],
      slot_id: response["slot_id"],
      last_confirmed_at: Time.current
    )
    session
  end
end
