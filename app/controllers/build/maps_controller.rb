class Build::MapsController < Build::BaseController
  skip_authorization_check only: [:index, :new, :create, :edit]
  layout "build_map_client", only: :edit

  KEY_FORMAT = Build::AbilitiesController::KEY_FORMAT

  def index
    entries = Github::ContentClient.new(current_user).list_directory_recursive("zones")
    @maps = entries.select { |entry| map_file?(entry["path"]) }.sort_by { |entry| entry["path"] }
  end

  # `prefix` lets the zone editor's "Create Map" link (opened in a new tab -
  # see Build::ZonesController) pre-fill the zone's own key, e.g.
  # "goblin-cave/", so the author only has to type the map's own key.
  def new
    Github::ContentClient.new(current_user) # raises (and BaseController redirects) if there's no repo connected yet
    @key = params[:prefix].to_s
  end

  def create
    @key = params[:key].to_s.strip
    return render_new_with_error("Key is required.") if @key.blank?
    return render_new_with_error("Key must contain only letters, numbers, underscores, hyphens, and \"/\" to place it in a subdirectory.") unless @key.match?(KEY_FORMAT)
    return render_new_with_error("\"#{@key}\" is already taken.") if map_key_taken?(@key)

    redirect_to edit_build_map_path(id: @key)
  end

  # No map content, its background image, or its unit-type/item lists are
  # fetched here - the editor fetches all of it itself, client-side, on
  # mount (see client/src/mapEditor/MapEditor.jsx/mapContentLoaders.js and
  # plans/editor-git.md). Still checks for a connected repo up front, the
  # same way #new does. There's no separate #available_unit_types/
  # #available_items refresh/lazy-fetch action any more either - both are
  # just re-running the same client-side loaders.
  def edit
    Github::ContentClient.new(current_user)
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
end
