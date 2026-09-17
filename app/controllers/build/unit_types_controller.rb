class Build::UnitTypesController < Build::BaseController
  skip_authorization_check only: [:index, :new, :create, :edit]
  layout "build_unit_type_client", only: :edit

  KEY_FORMAT = Build::AbilitiesController::KEY_FORMAT

  def index
    @unit_types = Github::ContentClient.new(current_user).list_directory_recursive("unit_types")
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
    return render_new_with_error("\"#{@key}\" is already taken.") if unit_type_key_taken?(@key)

    redirect_to edit_build_unit_type_path(id: @key)
  end

  # No unit type content, or its available abilities, are fetched here -
  # the editor fetches both itself, client-side, on mount (see
  # client/src/unitTypeEditor/UnitTypeEditor.jsx and plans/editor-git.md).
  # Still checks for a connected repo up front, the same way #new does.
  # There's no separate #available_abilities refresh action any more either
  # - refreshing is just re-running the same client-side load.
  def edit
    Github::ContentClient.new(current_user)
    @stock_assets = Content::StockAssets.client_json
  end

  private

  def render_new_with_error(message)
    flash.now[:alert] = message
    render :new, status: :unprocessable_content
  end

  def unit_type_key_taken?(key)
    Github::ContentClient.new(current_user).list_directory_recursive("unit_types").any? { |entry| entry["path"] == "unit_types/#{key}.json" }
  end
end
