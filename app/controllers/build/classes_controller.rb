class Build::ClassesController < Build::BaseController
  skip_authorization_check only: [:index, :new, :create, :edit]
  layout "build_class_client", only: :edit

  KEY_FORMAT = Build::AbilitiesController::KEY_FORMAT

  def index
    @classes = Github::ContentClient.new(current_user).list_directory_recursive("classes")
      .select { |entry| entry["name"].end_with?(".json") && !entry["name"].end_with?(".full.json") }
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
    return render_new_with_error("\"#{@key}\" is already taken.") if class_key_taken?(@key)

    redirect_to edit_build_class_path(id: @key)
  end

  # No class content, or its available abilities, are fetched here - the
  # editor fetches both itself, client-side, on mount (see
  # client/src/classEditor/ClassEditor.jsx and plans/editor-git.md). Still
  # checks for a connected repo up front, the same way #new does.
  def edit
    Github::ContentClient.new(current_user)
    @stock_assets = Content::StockAssets.client_json
  end

  private

  def render_new_with_error(message)
    flash.now[:alert] = message
    render :new, status: :unprocessable_content
  end

  def class_key_taken?(key)
    Github::ContentClient.new(current_user).list_directory_recursive("classes").any? { |entry| entry["path"] == "classes/#{key}.json" }
  end
end
