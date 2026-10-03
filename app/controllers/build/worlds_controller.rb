# The world list, and the single-page world editor (see
# plans/world-editor/). Like every other content editor, the editor fetches
# nothing here - it reads and writes the content repo from the browser, on
# whichever branch it's pointed at.
class Build::WorldsController < Build::BaseController
  include Build::WorldPublishing

  skip_authorization_check only: [:index, :new, :create, :edit]
  layout "build_world_client", only: :edit

  KEY_FORMAT = /\A[A-Za-z0-9_-]+\z/

  def index
    entries = Github::ContentClient.new(current_user).list_directory_recursive("worlds")
    @world_paths = World.world_file_paths(entries.pluck("path"))
    @published_worlds = current_user.worlds.where(path: @world_paths).index_by(&:path)
  end

  def new
    Github::ContentClient.new(current_user) # raises (and BaseController redirects) if there's no repo connected yet
    @key = params[:key].to_s
  end

  def create
    @key = params[:key].to_s.strip
    return render_new_with_error("Key is required.") if @key.blank?
    return render_new_with_error("Key must contain only letters, numbers, underscores and hyphens.") unless @key.match?(KEY_FORMAT)
    return render_new_with_error("\"#{@key}\" is already taken.") if world_key_taken?(@key)

    redirect_to edit_build_world_path(id: @key)
  end

  def edit
    @next_tag = next_tag(Github::ContentClient.new(current_user), params[:id]) # raises (and BaseController redirects) with no repo connected
  end

  # Publish: tags the branch's head - only if it's still the commit the
  # editor expanded (expected_sha), so nothing committed since then is
  # published unvalidated - and records an unreleased version for that
  # tag, which imports itself. Responds with the versions page URL.
  def publish
    key = params[:id]
    tag = params[:tag].to_s.strip
    client = Github::ContentClient.new(current_user)
    world = World.find_or_initialize_by(repo: client.repo, path: World.self_contained_path(key))
    world.owner ||= current_user
    authorize! :manage, world

    error = publish_error(client, tag) || branch_error(client, params[:branch].to_s, params[:expected_sha].to_s)
    return render(json: {error:}, status: :unprocessable_content) if error

    tag_and_record_version(client, world, tag, params[:expected_sha].to_s)
  rescue Github::ApiError => e
    render json: {error: e.message}, status: :unprocessable_content
  end

  private

  def render_new_with_error(message)
    flash.now[:alert] = message
    render :new, status: :unprocessable_content
  end

  def world_key_taken?(key)
    Github::ContentClient.new(current_user).list_directory_recursive("worlds").any? do |entry|
      entry["path"] == World.self_contained_path(key) || entry["path"] == "worlds/#{key}.json"
    end
  end

  def branch_error(client, branch, expected_sha)
    return "A branch and its expanded commit are required." if branch.blank? || expected_sha.blank?
    head = client.branch_sha(branch)
    return if head == expected_sha
    "#{branch} has moved on since it was expanded (now at #{head[0, 7]}); reload, then validate and expand again."
  rescue Github::NotFoundError
    "Branch #{branch} doesn't exist."
  end
end
