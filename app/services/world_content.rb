require "digest"

# Reads a world zone's .full.json from its pinned (commit SHA) URL, refusing
# it if its SHA1 no longer matches the one recorded at import. Delve never
# stores world content - only references, checksums, and the structure
# ImportWorldVersionJob extracts (names, entry point, links) - so the zone
# file is fetched fresh each time Rails hands it to the game server.
module WorldContent
  Error = Class.new(StandardError)
  FetchError = Class.new(Error)
  # The file no longer matches what was validated at import; refuse to use it.
  ChecksumMismatch = Class.new(Error)

  module_function

  def zone(zone)
    url = zone.world_version.zone_url(zone)
    body = get!(url)
    actual_sha = Digest::SHA1.hexdigest(body)
    raise ChecksumMismatch, "#{url} has checksum #{actual_sha}, expected #{zone.content_sha}" unless actual_sha == zone.content_sha
    JSON.parse(body)
  end

  def get!(url)
    response = Net::HTTP.get_response(URI(url))
    raise FetchError, "#{url}: HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)
    response.body
  end
end
