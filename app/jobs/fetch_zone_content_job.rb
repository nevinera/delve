require "digest"

class FetchZoneContentJob < ApplicationJob
  queue_as :default

  def perform(zone_id)
    zone = Zone.find(zone_id)
    response = Net::HTTP.get_response(URI.parse(zone.config_url))
    raise "Failed to fetch zone content from #{zone.config_url}: HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

    body = response.body

    begin
      data = JSON.parse(body)
    rescue JSON::ParserError => e
      zone.update!(state: :validation_failed, validity_error: "invalid JSON: #{e.message}")
      return
    end

    begin
      Validators::ZoneValidator.validate!(data)
    rescue Validators::ValidationError => e
      zone.update!(state: :validation_failed, validity_error: e.message)
      return
    end

    zone.update!(
      content_sha: Digest::SHA1.hexdigest(body),
      file_size: body.bytesize,
      state: :fetched
    )
  end
end
