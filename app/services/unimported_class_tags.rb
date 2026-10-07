# The versions a class has been tagged at ("<key>-<major>.<minor>") in the
# user's connected repo that aren't registered here as CharacterClass rows
# yet - published from another Rails instance, or tagged by hand. nil when
# GitHub can't be read.
class UnimportedClassTags
  def self.call(...) = new(...).call

  def initialize(key:, user:)
    @key = key
    @user = user
  end

  def call
    tagged = Github::ContentClient.new(@user).tag_names("#{@key}-").filter_map { |tag| version_of(tag) }
    tagged - CharacterClass.where(identifier: @key).pluck(:version)
  rescue Github::ApiError, Github::NotFoundError, Github::NoRepositoryError
    nil
  end

  private

  # "puncher-0.3" -> "0.3"; nil for another class's tag ("puncher-two-1.0").
  def version_of(tag) = tag.delete_prefix("#{@key}-")[/\A\d+\.\d+\z/]
end
