require "digest"

class FetchCharacterClassContentJob < ApplicationJob
  queue_as :default

  def perform(character_class_id)
    character_class = CharacterClass.find(character_class_id)
    response = Net::HTTP.get_response(URI.parse(character_class.location))
    raise "Failed to fetch class content from #{character_class.location}: HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

    character_class.update!(
      content_sha: Digest::SHA1.hexdigest(response.body),
      file_size: response.body.bytesize,
      state: :fetched
    )
  end
end
