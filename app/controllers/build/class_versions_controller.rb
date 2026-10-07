# A class's versions: the ones registered here as CharacterClass rows, and
# the tags in the builder's repo that aren't yet (see UnimportedClassTags),
# which can be imported without publishing again from the editor.
class Build::ClassVersionsController < Build::BaseController
  include Build::ClassPublishing

  skip_authorization_check only: :index

  def index
    @key = params[:id]
    @versions = CharacterClass.where(identifier: @key).to_a
    @unimported_versions = UnimportedClassTags.call(key: @key, user: current_user)
    @rows = newest_first(@versions + Array(@unimported_versions))
  end

  # Imports the class at its "<key>-<version>" tag, after the same checks
  # Publish makes (bar the tag being new) and validating the tagged content.
  def create
    authorize! :create, CharacterClass
    key, version = params[:id], params[:version].to_s
    client = Github::ContentClient.new(current_user)
    error = class_import_error(client, key, version)
    return redirect_to(build_class_versions_path(id: key), alert: error) if error

    import_class!(client, key, version)
    redirect_to build_class_versions_path(id: key), notice: "Importing #{key} #{version}."
  end

  private

  def import_class!(client, key, version)
    location = class_url(client, "refs/tags/#{class_tag(key, version)}", key)
    CharacterClass.create!(user: current_user, identifier: key, version:, location:)
  end

  # Registered versions and not-imported version strings together, by version.
  def newest_first(rows)
    rows.sort_by { |row| (row.is_a?(String) ? row : row.version).split(".").map(&:to_i) }.reverse
  end
end
