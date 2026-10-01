require "digest"

# Reads a world version's files from their pinned (commit SHA) URLs. Delve
# never stores world content, only references and checksums (see
# ImportWorldVersionJob), so every read goes back to the repo - verified
# against the SHA1 recorded at import, and cached by that SHA: content at a
# given SHA can never change, so cache entries never need invalidating.
module WorldContent
  Error = Class.new(StandardError)
  FetchError = Class.new(Error)
  # The file no longer matches what was validated at import; refuse to use it.
  ChecksumMismatch = Class.new(Error)

  module_function

  def world(version) = fetch("#{version.raw_base_url}#{version.world.path}", version.content_sha)

  def zone(zone) = fetch(zone.world_version.zone_url(zone), zone.content_sha)

  def fetch(url, expected_sha)
    Rails.cache.fetch(["world-content", expected_sha]) do
      body = get!(url)
      actual_sha = Digest::SHA1.hexdigest(body)
      raise ChecksumMismatch, "#{url} has checksum #{actual_sha}, expected #{expected_sha}" unless actual_sha == expected_sha
      JSON.parse(body)
    end
  end

  def get!(url)
    response = Net::HTTP.get_response(URI(url))
    raise FetchError, "#{url}: HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)
    response.body
  end
end
