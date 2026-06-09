require "digest"

class FetchCharacterClassContentJob < ApplicationJob
  queue_as :default

  def perform(character_class_id)
    character_class = CharacterClass.find(character_class_id)
    body = fetch_body!(character_class)
    data = JSON.parse(body)
    Validators::CharacterClassValidator.validate!(data)
    character_class.update!(content_sha: Digest::SHA1.hexdigest(body), file_size: body.bytesize, state: :fetched)
  rescue JSON::ParserError => e
    character_class.update!(state: :validation_failed, validity_error: "invalid JSON: #{e.message}")
  rescue Validators::ValidationError => e
    character_class.update!(state: :validation_failed, validity_error: e.message)
  end

  private

  def fetch_body!(character_class)
    response = Net::HTTP.get_response(URI.parse(character_class.location))
    raise "Failed to fetch class content from #{character_class.location}: HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)
    response.body
  end
end
