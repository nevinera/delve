# Plays a zone straight from the builder's repo (its default branch's latest
# commit) with one of their characters - for trying a zone out while
# building it, with no Zone or WorldVersion record and nothing persisted
# (see JoinDirectZone). The repo must be public, since the game client reads
# the zone from its raw URL.
class Build::ZonePlaysController < Build::BaseController
  RAW_BASE = "https://raw.githubusercontent.com"

  PlayError = Class.new(StandardError)

  def show
    @key = params[:id]
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

  private

  def join!
    client = Github::ContentClient.new(current_user)
    raise PlayError, "#{client.repo} is private; zones can only be played from a public repo." unless client.public_repo?

    sha = client.branch_sha(client.default_branch)
    @zone_source_url = "#{RAW_BASE}/#{client.repo}/#{sha}/zones/#{@key}/#{File.basename(@key)}.full.json"
    zone_data = parse(WorldContent.get!(@zone_source_url))
    Validators::ZoneValidator.validate!(zone_data)
    @result = JoinDirectZone.call(character: @character, zone_key: @key, commit_sha: sha,
      source_url: @zone_source_url, zone_data:)
    @equipped_items = EquippedItems::ForCharacter.call(character: @character)
    @character_settings = @character.setting_or_default.as_client_json
    @stock_assets = Content::StockAssets.client_json
  end

  def parse(body)
    JSON.parse(body)
  rescue JSON::ParserError => e
    raise PlayError, "#{@key}'s .full.json isn't valid JSON: #{e.message}"
  end
end
