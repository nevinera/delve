class Build::WorldsController < Build::BaseController
  skip_authorization_check only: [:index, :new, :create, :edit]
  layout "build_world_client", only: :edit

  KEY_FORMAT = Build::AbilitiesController::KEY_FORMAT

  def index
    entries = Github::ContentClient.new(current_user).list_directory_recursive("worlds")
    @worlds = entries.select { |entry| entry["name"].end_with?(".json") }.sort_by { |entry| entry["path"] }
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
    Github::ContentClient.new(current_user)
  end

  private

  def render_new_with_error(message)
    flash.now[:alert] = message
    render :new, status: :unprocessable_content
  end

  def world_key_taken?(key)
    Github::ContentClient.new(current_user).list_directory_recursive("worlds").any? { |entry| entry["path"] == "worlds/#{key}.json" }
  end
end
