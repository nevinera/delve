# The class editor's Publish (issue #48): tags the class's commit as
# "<key>-<version>" and registers that tag as a playable CharacterClass
# version, which fetches itself (see FetchCharacterClassContentJob).
module Build::ClassPublishing
  include Build::ContentTagging

  VERSION_FORMAT = /\A\d+\.\d+\z/

  private

  def class_tag(key, version) = "#{key}-#{version}"

  # The latest registered version with its minor number bumped, or "0.1".
  def next_class_version(key)
    latest = CharacterClass.where(identifier: key).pluck(:version).map { |v| v.split(".").map(&:to_i) }.max
    latest ? "#{latest[0]}.#{latest[1] + 1}" : "0.1"
  end

  def class_publish_error(client, key, version)
    return "#{client.repo} is private; classes must be published from a public repo." unless client.public_repo?
    return "To publish, a class key must be 3+ lowercase letters, numbers and underscores." unless key.match?(CharacterClass::IDENTIFIER_FORMAT)
    return "Version must be two numbers, like 1.0." unless version.match?(VERSION_FORMAT)
    version_taken_error(client, key, version)
  end

  def version_taken_error(client, key, version)
    return "#{key} belongs to another builder." if CharacterClass.where(identifier: key).where.not(user: current_user).exists?
    return "#{key} #{version} is already published." if CharacterClass.exists?(identifier: key, version:)
    "Tag \"#{class_tag(key, version)}\" already exists." if tag_exists?(client, class_tag(key, version))
  end

  # Checked before tagging, so a tag never points at a class that can't load.
  def class_content_error(client, key, sha)
    Validators::CharacterClassValidator.validate!(JSON.parse(VerifiedContent.get!(class_url(client, sha, key))))
    nil
  rescue VerifiedContent::Error, JSON::ParserError, Validators::ValidationError => e
    "classes/#{key}.json isn't publishable: #{e.message}"
  end

  def class_url(client, ref, key) = "https://raw.githubusercontent.com/#{client.repo}/#{ref}/classes/#{key}.json"

  def publish_class!(client, key, version, sha)
    tag = class_tag(key, version)
    client.create_tag(tag, sha)
    CharacterClass.create!(user: current_user, identifier: key, version:, location: class_url(client, "refs/tags/#{tag}", key))
  end
end
