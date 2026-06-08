require "digest"

class FetchZoneContentJob < ApplicationJob
  queue_as :default

  def perform(zone_id)
    zone = Zone.find(zone_id)
    response = Net::HTTP.get_response(URI.parse(zone.config_url))
    raise "Failed to fetch zone content from #{zone.config_url}: HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

    zone.update!(
      content_sha: Digest::SHA1.hexdigest(response.body),
      file_size: response.body.bytesize,
      state: :fetched
    )
  end
end
