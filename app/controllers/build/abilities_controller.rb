class Build::AbilitiesController < Build::BaseController
  skip_authorization_check only: [:index, :new, :create, :edit]
  layout "build_client", only: :edit

  # Each "/"-separated segment is a directory (e.g. "classes/druid/wildshape"
  # → abilities/classes/druid/wildshape.json) - lets abilities be organized
  # into subdirectories instead of all living flat in abilities/.
  KEY_FORMAT = %r{\A[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*\z}

  MIME_TYPES = {
    ".svg" => "image/svg+xml", ".png" => "image/png", ".webp" => "image/webp",
    ".jpg" => "image/jpeg", ".jpeg" => "image/jpeg", ".gif" => "image/gif",
    ".ogg" => "audio/ogg", ".mp3" => "audio/mpeg", ".wav" => "audio/wav"
  }.freeze

  def index
    entries = Github::ContentClient.new(current_user).list_directory_recursive("abilities")
    @abilities = entries.select { |entry| entry["name"].end_with?(".json") }.sort_by { |entry| entry["path"] }
  end

  def new
    Github::ContentClient.new(current_user) # raises (and BaseController redirects) if there's no repo connected yet
    @key = params[:key].to_s
  end

  def create
    @key = params[:key].to_s.strip
    return render_new_with_error("Key is required.") if @key.blank?
    return render_new_with_error("Key must contain only letters, numbers, underscores, hyphens, and \"/\" to place it in a subdirectory.") unless @key.match?(KEY_FORMAT)
    return render_new_with_error("\"#{@key}\" is already taken.") if ability_key_taken?(@key)

    redirect_to edit_build_ability_path(id: @key)
  end

  def edit
    load_ability
    @stock_assets = Content::StockAssets.client_json
  end

  private

  def render_new_with_error(message)
    flash.now[:alert] = message
    render :new, status: :unprocessable_content
  end

  def ability_key_taken?(key)
    Github::ContentClient.new(current_user).list_directory_recursive("abilities").any? { |entry| entry["path"] == "abilities/#{key}.json" }
  end

  def load_ability
    content = Github::ContentClient.new(current_user).file_content("abilities/#{params[:id]}.json")
    @ability = JSON.parse(content)
    @asset_thumbnails = fetch_asset_thumbnails(@ability)
  rescue Github::NotFoundError
    @ability = blank_ability(params[:id])
    @asset_thumbnails = {}
  end

  def blank_ability(key)
    {
      "name" => key.tr("_-", " ").split.map(&:capitalize).join(" "),
      "description" => "",
      "castTime" => nil,
      "globalCooldown" => 1.0,
      "tags" => [],
      "graphicEffects" => [],
      "soundEffects" => [],
      "effects" => []
    }
  end

  def fetch_asset_thumbnails(data)
    client = Github::ContentClient.new(current_user)
    collect_asset_urls(data).index_with { |url| asset_data_uri(client, url) }.compact
  end

  def collect_asset_urls(data)
    case data
    when Hash
      data.flat_map { |key, value| (key.end_with?("URL") && value.is_a?(String) && !stock_reference?(value)) ? [value] : collect_asset_urls(value) }
    when Array
      data.flat_map { |value| collect_asset_urls(value) }
    else
      []
    end
  end

  # The directory a relative asset URL (e.g. "../graphics/icons/x.svg")
  # resolves against - abilities/<key>.json's own directory, same as
  # client/src/editor/saveAbility.js's resolveRepoPath. A flat key (no "/")
  # gives File.dirname(key) == "." which Pathname#cleanpath drops, so this
  # still resolves to plain "abilities" for existing non-nested content.
  def ability_base_dir
    Pathname.new("abilities").join(File.dirname(params[:id]))
  end

  # A ":name:" stock asset (see docs/schema/common.md#stock-asset-reference)
  # is server-hosted, not in the user's repo - it needs no GitHub fetch/
  # base64 embedding for the preview, unlike everything else this collects.
  def stock_reference?(value)
    value.start_with?(":") && value.end_with?(":")
  end

  def asset_data_uri(client, relative_url)
    mime_type = MIME_TYPES[File.extname(relative_url).downcase]
    return nil unless mime_type

    resolved_path = ability_base_dir.join(relative_url).cleanpath.to_s
    "data:#{mime_type};base64,#{Base64.strict_encode64(client.file_content(resolved_path))}"
  rescue Github::ReauthRequiredError
    raise
  rescue
    nil
  end
end
