# Reads a world zone's .full.json from its pinned (commit SHA) URL, refusing
# it if its SHA1 no longer matches the one recorded at import. Delve never
# stores world content - only references, checksums, and the structure
# ImportWorldVersionJob extracts (names, entry point, links) - so the zone
# file is fetched fresh each time Rails hands it to the game server.
module WorldContent
  Error = VerifiedContent::Error
  FetchError = VerifiedContent::FetchError
  ChecksumMismatch = VerifiedContent::ChecksumMismatch

  module_function

  def zone(zone) = VerifiedContent.fetch(zone.world_version.zone_url(zone), zone.content_sha)

  def get!(url) = VerifiedContent.get!(url)
end
