# The world's "<key>/..." tags in its repo that have no WorldVersion here
# yet - published from another Rails instance, or tagged by hand - newest
# first. Read through the user's GitHub connection, so only listed when that
# points at the world's repo; nil when it doesn't, or GitHub can't be read.
class UnimportedWorldTags
  def self.call(...) = new(...).call

  def initialize(world:, user:)
    @world = world
    @user = user
  end

  def call
    client = Github::ContentClient.new(@user)
    return unless client.repo == @world.repo

    imported = @world.world_versions.pluck(:ref).to_set
    newest_first(client.tag_names("#{@world.key}/").reject { |tag| imported.include?(tag) })
  rescue Github::ApiError, Github::NotFoundError, Github::NoRepositoryError
    nil
  end

  private

  # By their numbers, so demo/v10 comes before demo/v9.
  def newest_first(tags)
    tags.sort_by { |tag| tag.scan(/\d+/).map(&:to_i) }.reverse
  end
end
