class Build::ZonesController < Build::BaseController
  skip_authorization_check only: [:index, :new, :create, :edit]
  layout "build_zone_client", only: :edit

  KEY_FORMAT = Build::AbilitiesController::KEY_FORMAT

  def index
    entries = Github::ContentClient.new(current_user).list_directory_recursive("zones")
    @zones = entries.select { |entry| zone_file?(entry["path"]) }.sort_by { |entry| entry["path"] }
  end

  def new
    Github::ContentClient.new(current_user) # raises (and BaseController redirects) if there's no repo connected yet
    @key = ""
  end

  def create
    @key = params[:key].to_s.strip
    return render_new_with_error("Key is required.") if @key.blank?
    return render_new_with_error("Key must contain only letters, numbers, underscores, hyphens, and \"/\" to place it in a subdirectory.") unless @key.match?(KEY_FORMAT)
    return render_new_with_error("\"#{@key}\" is already taken.") if zone_key_taken?(@key)

    redirect_to edit_build_zone_path(id: @key)
  end

  def edit
    load_zone
  end

  private

  def render_new_with_error(message)
    flash.now[:alert] = message
    render :new, status: :unprocessable_content
  end

  # A zone lives at zones/<key>/<basename(key)>.json - the same "own
  # subdirectory, basename-matched file" convention Build::MapsController's
  # #map_path uses one level down for maps inside it (see
  # ../content/zones/goblin-cave/goblin-cave.json in the real content repo).
  # One slash after stripping "zones/" is what distinguishes a zone's own
  # file from a map file living deeper inside it (see #map_file? for the
  # exact same trick at depth 2).
  def zone_file?(path)
    return false unless path.end_with?(".json") && !path.end_with?(".full.json")
    path.delete_prefix("zones/").count("/") == 1
  end

  def zone_path(key)
    "zones/#{key}/#{key.split("/").last}.json"
  end

  def zone_key_taken?(key)
    Github::ContentClient.new(current_user).list_directory_recursive("zones").any? { |entry| entry["path"] == zone_path(key) }
  end

  def load_zone
    content = Github::ContentClient.new(current_user).file_content(zone_path(params[:id]))
    @zone = JSON.parse(content)
  rescue Github::NotFoundError
    @zone = blank_zone(params[:id])
  end

  # Only `name` is editable yet (see plans/zone-editor.md step 2) - the rest
  # of the schema's fields are stubbed in now so later steps have something
  # to read/mutate without every step needing its own migration of a
  # partial draft.
  def blank_zone(key)
    {
      "name" => key.split("/").last.tr("_-", " ").split.map(&:capitalize).join(" "),
      "description" => nil,
      "elvl" => nil,
      "private" => nil,
      "maps" => [],
      "unitTypes" => {},
      "items" => {},
      "zoneLinks" => [],
      "entryPoints" => {},
      "openConnections" => {}
    }
  end
end
