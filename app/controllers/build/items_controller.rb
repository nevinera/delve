class Build::ItemsController < Build::BaseController
  skip_authorization_check only: [:index, :new, :create, :edit]
  layout "build_item_client", only: :edit

  KEY_FORMAT = Build::AbilitiesController::KEY_FORMAT

  def index
    @items = Github::ContentClient.new(current_user).list_directory_recursive("items")
      .select { |entry| entry["name"].end_with?(".json") }
      .sort_by { |entry| entry["path"] }
  end

  def new
    Github::ContentClient.new(current_user) # raises (and BaseController redirects) if there's no repo connected yet
    @key = ""
  end

  def create
    @key = params[:key].to_s.strip
    return render_new_with_error("Key is required.") if @key.blank?
    return render_new_with_error("Key must contain only letters, numbers, underscores, hyphens, and \"/\" to place it in a subdirectory.") unless @key.match?(KEY_FORMAT)
    return render_new_with_error("\"#{@key}\" is already taken.") if item_key_taken?(@key)

    redirect_to edit_build_item_path(id: @key)
  end

  # No item content is fetched here - the editor fetches it itself,
  # client-side, on mount (see client/src/itemEditor/ItemEditor.jsx and
  # plans/editor-git.md). Still checks for a connected repo up front, the
  # same way #new does, so a disconnected user gets redirected immediately
  # rather than after the editor shell has already loaded.
  def edit
    Github::ContentClient.new(current_user)
  end

  private

  def render_new_with_error(message)
    flash.now[:alert] = message
    render :new, status: :unprocessable_content
  end

  def item_key_taken?(key)
    Github::ContentClient.new(current_user).list_directory_recursive("items").any? { |entry| entry["path"] == "items/#{key}.json" }
  end
end
