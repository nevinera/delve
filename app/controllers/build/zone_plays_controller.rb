# Plays a zone straight from source with one of the builder's characters -
# for trying a zone out while building it, with no Zone or WorldVersion
# record and nothing persisted (see JoinDirectZone). The source is either
# the builder's GitHub repo (its default branch's latest commit; the repo
# must be public, since the game client reads the zone from its raw URL) or,
# when configured, a local content server (config.x.local_content_url).
class Build::ZonePlaysController < Build::BaseController
  RAW_BASE = "https://raw.githubusercontent.com"

  PlayError = Class.new(StandardError)

  def show
    @key = params[:id]
    @local = params[:source] == "local"
    raise ActionController::RoutingError, "local content isn't configured" if @local && !local_content_url
    @characters = current_user.characters.order(:name)
    authorize! :read, Character
    return render(:pick) unless params[:character_id]

    @character = current_user.characters.find(params[:character_id])
    authorize! :read, @character
    join!
    render :show, layout: "game_client"
  rescue PlayError, WorldContent::Error, Validators::ValidationError, GameApi::Error => e
    @error = e.message
    render :unavailable, status: :service_unavailable
  end

  # The "Play a local zone" form, which submits back here with the key.
  def local
    authorize! :read, Character
    raise ActionController::RoutingError, "local content isn't configured" unless local_content_url
    key = params[:key].to_s.strip.delete_prefix("/").delete_suffix("/")
    return redirect_to(build_local_zone_play_path(id: key)) if key.present?
    @local_content_url = local_content_url
  end

  private

  def join!
    @zone_source_url, version = @local ? local_source : github_source
    body = WorldContent.get!(@zone_source_url)
    version ||= "local-#{Digest::SHA1.hexdigest(body).first(12)}"
    zone_data = parse(body)
    Validators::ZoneValidator.validate!(zone_data)
    @result = JoinDirectZone.call(character: @character, zone_key: @key, commit_sha: version,
      source_url: @zone_source_url, zone_data:)
    @equipped_items = EquippedItems::ForCharacter.call(character: @character)
    @character_settings = @character.setting_or_default.as_client_json
    @stock_assets = Content::StockAssets.client_json
  end

  # [url, version]: the zone at the default branch's latest commit.
  def github_source
    client = Github::ContentClient.new(current_user)
    raise PlayError, "#{client.repo} is private; zones can only be played from a public repo." unless client.public_repo?

    sha = client.branch_sha(client.default_branch)
    ["#{RAW_BASE}/#{client.repo}/#{sha}/#{zone_file}", sha]
  end

  # [url, nil]: a local file has no commit; join! versions it by content
  # instead, so an edited zone gets a fresh instance like a new commit does.
  def local_source = ["#{local_content_url}/#{zone_file}", nil]

  def zone_file = "zones/#{@key}/#{File.basename(@key)}.full.json"

  def local_content_url = Rails.configuration.x.local_content_url

  def parse(body)
    JSON.parse(body)
  rescue JSON::ParserError => e
    raise PlayError, "#{@key}'s .full.json isn't valid JSON: #{e.message}"
  end
end
