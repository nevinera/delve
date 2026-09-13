class Build::UnitTypesController < Build::BaseController
  skip_authorization_check only: [:index, :new, :create, :edit, :available_abilities]
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

  def edit
    load_unit_type
    @available_abilities = load_available_abilities
    @stock_assets = Content::StockAssets.client_json
  end

  # Refreshes the available-abilities list without a full page reload (e.g.
  # after creating a new ability in another tab) - same shape @available_abilities
  # takes in #edit.
  def available_abilities
    render json: load_available_abilities
  end

  private

  def render_new_with_error(message)
    flash.now[:alert] = message
    render :new, status: :unprocessable_content
  end

  def unit_type_key_taken?(key)
    Github::ContentClient.new(current_user).list_directory_recursive("unit_types").any? { |entry| entry["path"] == "unit_types/#{key}.json" }
  end

  def load_unit_type
    content = Github::ContentClient.new(current_user).file_content("unit_types/#{params[:id]}.json")
    @unit_type = JSON.parse(content)
  rescue Github::NotFoundError
    @unit_type = blank_unit_type(params[:id])
  end

  def blank_unit_type(key)
    {
      "name" => key.tr("_-", " ").split.map(&:capitalize).join(" "),
      "description" => "",
      "tokenImageUrl" => [],
      "tokenRadius" => 2.0,
      "maxHP" => 20,
      "dps" => 4.0,
      "attackSpeed" => 1.0,
      "resource" => {"name" => "energy", "color" => "888888", "max" => 100.0, "defaultValue" => 100.0, "returnRate" => 0.0, "isFluid" => true},
      "targeting" => {"type" => "aggroTable"},
      "tactics" => {"type" => "randomAvailable"},
      "powers" => []
    }
  end

  # Every ability committed under abilities/units/<key>/ - see
  # Build::ClassesController#load_available_abilities, which this mirrors.
  def load_available_abilities
    client = Github::ContentClient.new(current_user)
    entries = client.list_directory_recursive("abilities/units/#{params[:id]}")
      .select { |entry| entry["name"].end_with?(".json") }
    entries.to_h { |entry| ability_entry(client, entry) }
  end

  def ability_entry(client, entry)
    key = entry["path"].delete_prefix("abilities/").delete_suffix(".json")
    ability = JSON.parse(client.file_content(entry["path"]))
    [key, {ability: ability, assetMap: fetch_asset_thumbnails(client, key, ability)}]
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
