require "digest"

# Fetches content-repo JSON (a zone or class file) and refuses it unless its
# SHA1 matches the checksum recorded when it was imported or fetched - the
# game server and client must load exactly what Rails validated.
module VerifiedContent
  Error = Class.new(StandardError)
  FetchError = Class.new(Error)
  # The file no longer matches what was validated; refuse to use it.
  ChecksumMismatch = Class.new(Error)

  module_function

  def fetch(url, expected_sha)
    body = get!(url)
    actual_sha = Digest::SHA1.hexdigest(body)
    raise ChecksumMismatch, "#{url} has checksum #{actual_sha}, expected #{expected_sha}" unless actual_sha == expected_sha
    JSON.parse(body)
  end

  def get!(url)
    response = Net::HTTP.get_response(URI(url))
    raise FetchError, "#{url}: HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)
    response.body
  end
end
