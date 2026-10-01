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
      character_class: class_config
    }
  end

  # The class file, as long as it still matches what was validated when the
  # class was fetched (FetchCharacterClassContentJob); otherwise
  # VerifiedContent::ChecksumMismatch - the class needs refetching.
  def class_config
    character_class = @character.character_class
    VerifiedContent.fetch(character_class.location, character_class.content_sha)
  rescue VerifiedContent::ChecksumMismatch
    raise VerifiedContent::ChecksumMismatch,
      "#{character_class.identifier} #{character_class.version}'s class file has changed since it was checked; it needs refetching"
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
