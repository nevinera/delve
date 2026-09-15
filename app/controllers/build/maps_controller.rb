class Build::MapsController < Build::BaseController
  skip_authorization_check only: [:index, :new, :create, :edit, :available_unit_types, :available_items]
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
    @available_unit_type_keys = list_unit_type_keys
    @initial_unit_type_details = unit_type_details_for(map_unit_type_keys)
    @available_item_keys = list_item_keys
    @initial_item_details = item_details_for(map_loot_item_identifiers)
  end

  # Two different things depending on `keys[]`, both re-fetchable from the
  # client without a full page reload (e.g. after creating a new unit type
  # in another tab, or picking one from the dropdown):
  #
  # - no `keys[]`: the *cheap* full list of every unit_types/*.json key (a
  #   directory listing, not opening any file) - what the placement
  #   dropdown is built from. With real content potentially holding
  #   hundreds of unit types for a handful actually used on any one map,
  #   #edit and this action deliberately do NOT open/parse every file the
  #   way Build::UnitTypesController#load_available_abilities does -
  #   that doesn't scale.
  # - `keys[]` given: {name, tokenRadius, tokenImageUrl} for exactly those
  #   keys (each *does* open its file, and its token image) - used for
  #   units already on the map (see #edit's @initial_unit_type_details) and
  #   lazily for whichever key the author actually picks/places.
  def available_unit_types
    keys = Array(params[:keys])
    render json: keys.present? ? unit_type_details_for(keys) : list_unit_type_keys
  end

  # Same cheap-list-vs-lazy-details split as #available_unit_types, for the
  # items a unit's lootTable can reference. Unlike a unit's `unitType` key,
  # a lootTable key is the item's own `identifier` *field* (per
  # docs/schema/unit.md), not necessarily its file path - #item_details_for
  # assumes they match (true of every real item so far, and the convention
  # Build::ItemsController's own blank_item follows), returning the file's
  # real identifier either way so a mismatch still writes correctly, just
  # without a resolvable path back to it for prefetching.
  def available_items
    keys = Array(params[:keys])
    render json: keys.present? ? item_details_for(keys) : list_item_keys
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

  # Every unit_types/*.json key (unit types can nest in subdirectories,
  # unlike abilities - no depth limit) - just a directory listing, no file
  # contents opened, so this stays cheap regardless of how many unit types
  # the repo has.
  def list_unit_type_keys
    Github::ContentClient.new(current_user).list_directory_recursive("unit_types")
      .select { |entry| entry["name"].end_with?(".json") && !entry["name"].end_with?(".full.json") }
      .map { |entry| entry["path"].delete_prefix("unit_types/").delete_suffix(".json") }
  end

  # The distinct unitType keys already used by this map's units - what
  # #edit prefetches full details for, so already-placed units render
  # their real token immediately without the client needing to ask.
  def map_unit_type_keys
    Array(@map["units"]).filter_map { |unit| unit["unitType"] }.uniq
  end

  # {name, tokenRadius, tokenImageUrl} for exactly the given keys - each
  # opens that unit type's file (and its token image), unlike
  # #list_unit_type_keys. A key with no matching/parseable file (deleted or
  # renamed since a unit referencing it was placed, say) is just omitted,
  # not an error - the client already falls back gracefully (see
  # UnitShapes.jsx) for a unitType it has no details for.
  def unit_type_details_for(keys)
    client = Github::ContentClient.new(current_user)
    keys.filter_map { |key| unit_type_detail_pair(client, key) }.to_h
  end

  def unit_type_detail_pair(client, key)
    unit_type = JSON.parse(client.file_content("unit_types/#{key}.json"))
    [key, {name: unit_type["name"], tokenRadius: unit_type["tokenRadius"], tokenImageUrl: unit_type_token_data_uri(client, key, unit_type["tokenImageUrl"])}]
  rescue Github::ReauthRequiredError
    raise
  rescue
    nil
  end

  # tokenImageUrl may be a bare string or an array (docs/schema/unit_type.md)
  # - just the first option is enough for a dropdown/canvas thumbnail. Paths
  # are relative to the unit type's own file, same convention as
  # Build::UnitTypesController#fetch_asset_thumbnails.
  def unit_type_token_data_uri(client, key, token_image_url)
    url = token_image_url.is_a?(Array) ? token_image_url.first : token_image_url
    mime_type = url.present? && Build::AbilitiesController::MIME_TYPES[File.extname(url).downcase]
    return nil unless mime_type

    bytes = client.file_content(resolve_unit_type_asset_path(key, url))
    "data:#{mime_type};base64,#{Base64.strict_encode64(bytes)}"
  rescue Github::ReauthRequiredError
    raise
  rescue
    nil
  end

  def resolve_unit_type_asset_path(key, url)
    Pathname.new("unit_types").join(File.dirname(key)).join(url).cleanpath.to_s
  end

  # Every items/*.json key (items can nest in subdirectories, same as unit
  # types) - a directory listing only, same cost tradeoff as
  # #list_unit_type_keys.
  def list_item_keys
    Github::ContentClient.new(current_user).list_directory_recursive("items")
      .select { |entry| entry["name"].end_with?(".json") }
      .map { |entry| entry["path"].delete_prefix("items/").delete_suffix(".json") }
  end

  # Every distinct item identifier already referenced in any unit's
  # lootTable on this map - what #edit prefetches details for (assuming,
  # per #available_items' note, that the identifier is also the file path).
  def map_loot_item_identifiers
    Array(@map["units"]).flat_map { |unit| (unit["lootTable"] || {}).keys }.uniq
  end

  # {identifier, name, slot} for exactly the given keys - the returned
  # `identifier` is the item's own field (what actually belongs in a
  # lootTable), which may differ from `key` if the assumption above doesn't
  # hold for a particular item; a key with no matching/parseable file is
  # just omitted, not an error, same as #unit_type_details_for.
  def item_details_for(keys)
    client = Github::ContentClient.new(current_user)
    keys.filter_map { |key| item_detail_pair(client, key) }.to_h
  end

  def item_detail_pair(client, key)
    item = JSON.parse(client.file_content("items/#{key}.json"))
    [key, {identifier: item["identifier"], name: item["name"], slot: item["slot"]}]
  rescue Github::ReauthRequiredError
    raise
  rescue
    nil
  end

  def blank_map(key)
    basename = key.split("/").last
    {
      "identifier" => basename,
      "name" => basename.tr("_-", " ").split.map(&:capitalize).join(" "),
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
