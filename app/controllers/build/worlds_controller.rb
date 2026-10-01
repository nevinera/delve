class Build::WorldsController < Build::BaseController
  skip_authorization_check only: [:index, :new, :create, :edit]

  TAG_FORMAT = %r{\A[\w-]+(?:[/.][\w-]+)*\z}
  layout "build_world_client", only: :edit

  KEY_FORMAT = Build::AbilitiesController::KEY_FORMAT

  def index
    entries = Github::ContentClient.new(current_user).list_directory_recursive("worlds")
    @worlds = entries.select { |entry| entry["name"].end_with?(".json") && !entry["name"].end_with?(".layout.json") }.sort_by { |entry| entry["path"] }
    @published_worlds = current_user.worlds.where(path: @worlds.pluck("path")).index_by(&:path)
  end

  def new
    Github::ContentClient.new(current_user) # raises (and BaseController redirects) if there's no repo connected yet
    @key = params[:key].to_s
  end

  def create
    @key = params[:key].to_s.strip
    return render_new_with_error("Key is required.") if @key.blank?
    return render_new_with_error("Key must contain only letters, numbers, underscores, hyphens, and \"/\" to place it in a subdirectory.") unless @key.match?(KEY_FORMAT)
    return render_new_with_error("\"#{@key}\" is already taken.") if world_key_taken?(@key)

    redirect_to edit_build_world_path(id: @key)
  end

  # No world content is fetched here - the editor fetches its own content
  # client-side on mount, same as every other content-editing controller
  # (see e.g. Build::AbilitiesController#edit). Still checks for a connected
  # repo up front, the same way #new does.
  def edit
    @next_tag = next_tag(Github::ContentClient.new(current_user), params[:id])
  end

  # The editor's Publish button: tags the default branch's head (the saved
  # world, not the editor's draft), then creates an unreleased WorldVersion
  # for that tag, which imports itself. Responds with the versions page URL.
  def publish
    key = params[:id]
    tag = params[:tag].to_s.strip
    client = Github::ContentClient.new(current_user)
    world = World.find_or_initialize_by(repo: client.repo, path: "worlds/#{key}.json")
    world.owner ||= current_user
    authorize! :manage, world

    error = publish_error(client, tag)
    return render(json: {error:}, status: :unprocessable_content) if error

    client.create_tag(tag, client.branch_sha(client.default_branch))
    World.transaction do
      world.save!
      world.world_versions.create!(ref: tag)
    end
    render json: {url: build_publishing_world_path(world)}
  rescue Github::ApiError, ActiveRecord::RecordInvalid => e
    render json: {error: e.message}, status: :unprocessable_content
  end

  private

  def publish_error(client, tag)
    return "#{client.repo} is private; worlds must be published from a public repo." unless client.public_repo?
    return "Tag must be letters, numbers, \"-\" and \"_\", separated by \"/\" or \".\"." unless tag.match?(TAG_FORMAT)
    "Tag \"#{tag}\" already exists." if tag_exists?(client, tag)
  end

  def tag_exists?(client, tag)
    client.tag_sha(tag)
    true
  rescue Github::NotFoundError
    false
  end

  # "<key>/v<N+1>", N being the highest existing "<key>/v<N>" tag (or 0).
  def next_tag(client, key)
    prefix = "#{key}/v"
    numbers = client.tag_names(prefix).filter_map { |name| name.delete_prefix(prefix)[/\A\d+\z/]&.to_i }
    "#{prefix}#{(numbers.max || 0) + 1}"
  rescue Github::ApiError
    "#{prefix}1"
  end

  def render_new_with_error(message)
    flash.now[:alert] = message
    render :new, status: :unprocessable_content
  end

  def world_key_taken?(key)
    Github::ContentClient.new(current_user).list_directory_recursive("worlds").any? { |entry| entry["path"] == "worlds/#{key}.json" }
  end
end
