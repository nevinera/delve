class Build::MapsController < Build::BaseController
  skip_authorization_check only: [:index, :new, :create, :edit]
  layout "build_map_client", only: :edit

  KEY_FORMAT = Build::AbilitiesController::KEY_FORMAT

  def index
    entries = Github::ContentClient.new(current_user).list_directory_recursive("zones")
    @maps = entries.select { |entry| map_file?(entry["path"]) }.sort_by { |entry| entry["path"] }
  end

  def new
    Github::ContentClient.new(current_user) # raises (and BaseController redirects) if there's no repo connected yet
    @key = ""
  end

  def create
    @key = params[:key].to_s.strip
    return render_new_with_error("Key is required.") if @key.blank?
    return render_new_with_error("Key must contain only letters, numbers, underscores, hyphens, and \"/\" to place it in a subdirectory.") unless @key.match?(KEY_FORMAT)
    return render_new_with_error("\"#{@key}\" is already taken.") if map_key_taken?(@key)

    redirect_to edit_build_map_path(id: @key)
  end

  def edit
    load_map
    @initial_image_data_uri = fetch_image_data_uri
  end

  private

  def render_new_with_error(message)
    flash.now[:alert] = message
    render :new, status: :unprocessable_content
  end

  # A map lives at zones/<key>/<basename(key)>.json - one directory level
  # deeper than a zone's own zones/<zone>/<zone>.json, which is what
  # distinguishes the two when scanning the shared "zones" directory (see
  # ../content/zones/goblin-cave/{goblin-cave.json,gc1-.../gc1-....json}
  # in the real content repo).
  def map_file?(path)
    return false unless path.end_with?(".json") && !path.end_with?(".full.json")
    path.delete_prefix("zones/").count("/") == 2
  end

  def map_path(key)
    "zones/#{key}/#{key.split("/").last}.json"
  end

  def map_key_taken?(key)
    Github::ContentClient.new(current_user).list_directory_recursive("zones").any? { |entry| entry["path"] == map_path(key) }
  end

  def load_map
    content = Github::ContentClient.new(current_user).file_content(map_path(params[:id]))
    @map = JSON.parse(content)
  rescue Github::NotFoundError
    @map = blank_map(params[:id])
  end

  # An existing map's imageUrl is relative to the map's own file (see
  # docs/schema/map.md's example, e.g. "./gc1-goblin-cave-entrance.webp" next
  # to gc1-goblin-cave-entrance.json) - resolve and inline it as a data URI
  # so the editor can display it immediately, same approach as
  # Build::UnitTypesController#asset_data_uri for ability icons/sounds.
  # Uses #raw_file_content, not #file_content - real map backgrounds
  # routinely exceed the Contents API's 1MB inline-base64 threshold.
  def fetch_image_data_uri
    url = @map["imageUrl"]
    return nil if url.blank?

    mime_type = Build::AbilitiesController::MIME_TYPES[File.extname(url).downcase]
    return nil unless mime_type

    bytes = Github::ContentClient.new(current_user).raw_file_content(resolve_image_path(url))
    "data:#{mime_type};base64,#{Base64.strict_encode64(bytes)}"
  rescue Github::ReauthRequiredError
    raise
  rescue
    nil
  end

  def resolve_image_path(url)
    Pathname.new("zones").join(params[:id]).join(url).cleanpath.to_s
  end

  def blank_map(key)
    {
      "identifier" => key.split("/").last,
      "name" => key.tr("_-", " ").split.map(&:capitalize).join(" "),
      "elvl" => nil,
      "imageUrl" => nil,
      "pixelDimensions" => nil,
      "feetDimensions" => nil,
      "barriers" => [],
      "connections" => [],
      "units" => []
    }
  end
end
