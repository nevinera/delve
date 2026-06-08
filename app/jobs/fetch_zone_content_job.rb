require "digest"

class FetchZoneContentJob < ApplicationJob
  queue_as :default

  def perform(zone_id)
    zone = Zone.find(zone_id)
    body = fetch_body!(zone)
    data = JSON.parse(body)
    Validators::ZoneValidator.validate!(data)
    zone.update!(content_sha: Digest::SHA1.hexdigest(body), file_size: body.bytesize, state: :fetched)
  rescue JSON::ParserError => e
    zone.update!(state: :validation_failed, validity_error: "invalid JSON: #{e.message}")
  rescue Validators::ValidationError => e
    zone.update!(state: :validation_failed, validity_error: e.message)
  end

  private

  def fetch_body!(zone)
    response = Net::HTTP.get_response(URI.parse(zone.config_url))
    raise "Failed to fetch zone content from #{zone.config_url}: HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)
    response.body
  end
end
