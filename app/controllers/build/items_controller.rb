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

  def edit
    load_item
  end

  private

  def render_new_with_error(message)
    flash.now[:alert] = message
    render :new, status: :unprocessable_content
  end

  def item_key_taken?(key)
    Github::ContentClient.new(current_user).list_directory_recursive("items").any? { |entry| entry["path"] == "items/#{key}.json" }
  end

  def load_item
    content = Github::ContentClient.new(current_user).file_content("items/#{params[:id]}.json")
    @item = JSON.parse(content)
  rescue Github::NotFoundError
    @item = blank_item(params[:id])
  end

  def blank_item(key)
    {
      "identifier" => key.split("/").last,
      "name" => key.tr("_-", " ").split.map(&:capitalize).join(" "),
      "slot" => "chest",
      "elvl" => 0,
      "primary" => nil,
      "secondaries" => []
    }
  end
end
