# Tagging and version-suggestion helpers shared by the two world editors'
# Publish actions (Build::WorldsController, Build::WorldEditorController).
module Build::WorldPublishing
  include Build::ContentTagging

  TAG_FORMAT = %r{\A[\w-]+(?:[/.][\w-]+)*\z}

  private

  def publish_error(client, tag)
    return "#{client.repo} is private; worlds must be published from a public repo." unless client.public_repo?
    return "Tag must be letters, numbers, \"-\" and \"_\", separated by \"/\" or \".\"." unless tag.match?(TAG_FORMAT)
    "Tag \"#{tag}\" already exists." if tag_exists?(client, tag)
  end

  # "<key>/v<N+1>", N being the highest existing "<key>/v<N>" tag (or 0).
  def next_tag(client, key)
    prefix = "#{key}/v"
    numbers = client.tag_names(prefix).filter_map { |name| name.delete_prefix(prefix)[/\A\d+\z/]&.to_i }
    "#{prefix}#{(numbers.max || 0) + 1}"
  rescue Github::ApiError
    "#{prefix}1"
  end

  # Tags sha and records an unreleased version of world for it, which
  # imports itself. Renders the versions page URL, or the error.
  def tag_and_record_version(client, world, tag, sha)
    client.create_tag(tag, sha)
    World.transaction do
      world.save!
      world.world_versions.create!(ref: tag)
    end
    render json: {url: build_publishing_world_path(world)}
  rescue Github::ApiError, ActiveRecord::RecordInvalid => e
    render json: {error: e.message}, status: :unprocessable_content
  end
end
