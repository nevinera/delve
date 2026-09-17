class Build::ZonesController < Build::BaseController
  skip_authorization_check only: [:index, :new, :create, :edit, :available_maps]
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

  # Same cheap-list-vs-lazy-details split as Build::MapsController's own
  # #available_unit_types: @available_map_keys is a directory listing only
  # (no file opens at all), covering every real map under this zone -
  # what the "Add Map" dropdown shows candidates from, as bare keys, until
  # one is actually picked. @available_map_details opens a file per key,
  # but only for maps this zone *already* references - a bounded set,
  # unlike the full directory, which could hold many more maps than are
  # actually in use.
  def edit
    load_zone
    client = Github::ContentClient.new(current_user)
    @available_map_keys = zone_map_keys(client, params[:id])
    @available_map_details = map_details_for(client, params[:id], referenced_map_keys(@zone))
  end

  # keys[] given: {identifier, name, connections, units, thumbnailUrl} for
  # exactly those keys (each opens that map's file, and its thumbnail) -
  # used lazily for a map the author just picked from "Add Map", and for
  # #edit's own prefetch of already-referenced maps above. No keys[]: the
  # *cheap* full list of every real map key under this zone (a directory
  # listing, not opening any file) - what "Add Map"'s dropdown re-fetches
  # via a "Refresh" action (see ZoneEditor) after a map is created in
  # another tab.
  def available_maps
    client = Github::ContentClient.new(current_user)
    keys = Array(params[:keys])
    render json: keys.present? ? map_details_for(client, params[:id], keys) : zone_map_keys(client, params[:id])
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

  def map_details_for(client, zone_key, keys)
    keys.filter_map { |key|
      detail = map_detail(client, zone_key, key)
      [key, detail] if detail
    }.to_h
  end

  # The map keys this zone's own draft already references, derived from its
  # `maps` array's $ref strings ("./<key>/<key>.json") - mirrors the
  # client's own keyFromRef (mapRef.js) exactly, since both need to agree
  # on what "already referenced" means.
  def referenced_map_keys(zone)
    Array(zone["maps"]).filter_map { |entry|
      ref = entry["$ref"]
      ref&.delete_prefix("./")&.split("/")&.first
    }
  end

  # Every real map file directly under zones/<zone_key>/ - one slash after
  # stripping that prefix distinguishes a map file (zones/<zone>/<map>/<map>.json)
  # from the zone's own top-level file (zones/<zone>/<zone>.json), same
  # trick #zone_file? uses one level up. Tolerates a zone directory that
  # doesn't exist yet (a brand new zone) the same way
  # Build::MapsController's #list_unit_type_keys tolerates a missing
  # unit_types directory - list_directory_recursive just returns [].
  def zone_map_keys(client, zone_key)
    prefix = "zones/#{zone_key}/"
    client.list_directory_recursive("zones/#{zone_key}")
      .map { |entry| entry["path"] }
      .select { |path| path.end_with?(".json") && !path.end_with?(".full.json") }
      .map { |path| path.delete_prefix(prefix) }
      .select { |relative| relative.count("/") == 1 }
      .map { |relative| relative.split("/").first }
      .uniq
  end

  def map_detail(client, zone_key, map_key)
    map_data = JSON.parse(client.file_content("zones/#{zone_key}/#{map_key}/#{map_key}.json"))
    {
      identifier: map_data["identifier"],
      name: map_data["name"],
      connections: map_data["connections"] || [],
      units: unit_summaries(map_data["units"]),
      thumbnailUrl: map_thumbnail_data_uri(client, zone_key, map_key, map_data["thumbnailUrl"])
    }
  rescue Github::ReauthRequiredError
    raise
  rescue
    nil
  end

  # {unitType, itemKeys} per unit - just enough for the zone editor's
  # items/unit types lists (steps 7/8) to aggregate usage, not the unit's
  # full position/movement/etc, which would bloat this payload for a map
  # with many units for no reason those lists need it.
  def unit_summaries(units)
    Array(units).map { |unit| {unitType: unit["unitType"], itemKeys: (unit["lootTable"] || {}).keys} }
  end

  # Mirrors Build::MapsController#fetch_image_data_uri's approach, but for
  # the small thumbnail (see saveMap.js) rather than the full background -
  # resolved relative to the map's own file, same convention as that
  # method's #resolve_image_path.
  def map_thumbnail_data_uri(client, zone_key, map_key, thumbnail_url)
    return nil if thumbnail_url.blank?
    mime_type = Build::AbilitiesController::MIME_TYPES[File.extname(thumbnail_url).downcase]
    return nil unless mime_type

    path = Pathname.new("zones").join(zone_key).join(map_key).join(thumbnail_url).cleanpath.to_s
    bytes = client.raw_file_content(path)
    "data:#{mime_type};base64,#{Base64.strict_encode64(bytes)}"
  rescue Github::ReauthRequiredError
    raise
  rescue
    nil
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
