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

  def edit
    load_class
    @available_abilities = load_available_abilities
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

  def load_class
    content = Github::ContentClient.new(current_user).file_content("classes/#{params[:id]}.json")
    @class = JSON.parse(content)
  rescue Github::NotFoundError
    @class = blank_class(params[:id])
  end

  def blank_class(key)
    {
      "name" => key.tr("_-", " ").split.map(&:capitalize).join(" "),
      "description" => "",
      "colors" => {"major" => "888888", "minor" => "CCCCCC"},
      "resources" => [],
      "powers" => [],
      "primaryStats" => [],
      "secondaryStats" => [],
      "wields" => []
    }
  end

  # Every ability committed under abilities/classes/<key>/ - a slot's
  # dropdown picks one of these by its key (path relative to abilities/,
  # minus ".json"), and the preview pane needs each one's full content (plus
  # asset thumbnails, same as Build::AbilitiesController#edit) to actually
  # fire it.
  def load_available_abilities
    client = Github::ContentClient.new(current_user)
    entries = client.list_directory_recursive("abilities/classes/#{params[:id]}")
      .select { |entry| entry["name"].end_with?(".json") }
    entries.each_with_object({}) do |entry, map|
      key = entry["path"].delete_prefix("abilities/").delete_suffix(".json")
      ability = JSON.parse(client.file_content(entry["path"]))
      map[key] = {ability: ability, assetMap: fetch_asset_thumbnails(client, key, ability)}
    end
  end

  def fetch_asset_thumbnails(client, key, ability)
    base_dir = Pathname.new("abilities").join(File.dirname(key))
    collect_asset_urls(ability).index_with { |url| asset_data_uri(client, base_dir, url) }.compact
  end

  def collect_asset_urls(data)
    case data
    when Hash
      data.flat_map { |k, value| (k.end_with?("URL") && value.is_a?(String) && !stock_reference?(value)) ? [value] : collect_asset_urls(value) }
    when Array
      data.flat_map { |value| collect_asset_urls(value) }
    else
      []
    end
  end

  def stock_reference?(value)
    value.start_with?(":") && value.end_with?(":")
  end

  def asset_data_uri(client, base_dir, relative_url)
    mime_type = Build::AbilitiesController::MIME_TYPES[File.extname(relative_url).downcase]
    return nil unless mime_type

    resolved_path = base_dir.join(relative_url).cleanpath.to_s
    "data:#{mime_type};base64,#{Base64.strict_encode64(client.file_content(resolved_path))}"
  rescue Github::ReauthRequiredError
    raise
  rescue
    nil
  end
end
