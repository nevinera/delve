require "net/http"

# Base for joining a character to a zone: sends a slot request built by the
# subclass (JoinWorldZone, JoinDirectZone) and records the SlotSession.
class JoinZone
  Result = Data.define(:token, :instance_identifier, :slot_id)

  def self.call(...) = new(...).call

  def initialize(character:, zone:)
    @character = character
    @zone = zone
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

  def build_attrs = raise(NotImplementedError, "#{self.class} must implement #build_attrs")

  def character_attrs
    {
      character_name: @character.name,
      character_database_id: @character.id.to_s,
      character_class: fetch_json(@character.character_class.location)
    }
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
