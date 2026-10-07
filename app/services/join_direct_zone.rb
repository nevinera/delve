# Joins a character to a zone straight from their builder's repo, with no
# Zone or WorldVersion record: a direct-mode slot request (nothing is
# persisted, no exits) for the zone's .full.json at the given commit. The
# instance key includes the user and commit, so only this builder's
# characters share it, and a new commit gets a fresh instance.
class JoinDirectZone < JoinZone
  def initialize(character:, zone_key:, zone_data:, equipped_items:, **source)
    super(character:, zone: nil)
    @equipped_items = equipped_items
    @zone_key = zone_key
    @zone_data = zone_data
    @commit_sha = source.fetch(:commit_sha)
    @source_url = source.fetch(:source_url)
  end

  private

  def build_attrs
    character_attrs.merge(
      zone_identifier: @zone_key,
      version: @commit_sha,
      database_id: "",
      source_url: @source_url,
      zone_config: @zone_data,
      mode: "direct",
      instance_key: "direct:#{@character.user_id}:#{@commit_sha}:#{@zone_key}",
      owned_zone_items: {},
      equipped_items: @equipped_items,
      provenance_restrictions: ProvenanceRestrictions.payload_for_direct_zone(@zone_data)
    )
  end
end
