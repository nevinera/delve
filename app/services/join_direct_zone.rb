# Joins a character to a zone straight from their builder's repo, with no
# Zone or WorldVersion record: a direct-mode slot request (nothing is
# persisted, no exits) for the zone's .full.json at the given commit. The
# instance key includes the user and commit, so only this builder's
# characters share it, and a new commit gets a fresh instance.
class JoinDirectZone < JoinZone
  def initialize(character:, zone_key:, commit_sha:, source_url:, zone_data:)
    super(character:, zone: nil)
    @zone_key = zone_key
    @commit_sha = commit_sha
    @source_url = source_url
    @zone_data = zone_data
  end

  private

  def build_attrs
    {
      zone_identifier: @zone_key,
      version: @commit_sha,
      database_id: "",
      source_url: @source_url,
      zone_config: @zone_data,
      mode: "direct",
      instance_key: "direct:#{@character.user_id}:#{@commit_sha}:#{@zone_key}",
      character_name: @character.name,
      character_database_id: @character.id.to_s,
      character_class: fetch_json(@character.character_class.location),
      owned_zone_items: {},
      equipped_items: EquippedItems::ForCharacter.call(character: @character)
    }
  end
end
