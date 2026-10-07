# A character's worlds: the list (minus the ones they've hidden), one
# world's details and version choice, and entering it. Entering is also
# where the game client sends the player back to after a zone exit or a
# version expiry, so every visit re-resolves the version and position.
class Play::WorldCharactersController < Play::BaseController
  layout "game_client", only: :play

  before_action :load_character
  before_action :load_world, except: :index

  def index
    @show_all = params[:all].present?
    world_characters = @character.world_characters.index_by(&:world_id)
    @rows = listed_worlds(world_characters.keys).filter_map { |world| world_row(world, world_characters[world.id]) }
  end

  def show
    @world_character = @character.world_characters.find_by(world: @world)
    @versions = @world.released_versions
    @current_version = @world_character&.world_version
    @name = @world.name || @world.key
    @in_world = in_world?
  end

  def play
    result = EnterWorld.call(character: @character, world: @world)
    @zone = result.zone
    @result = result.join
    @owned_zone_items = result.owned_zone_items
    @equipped_items = EquippedItems::ForWorldCharacter.call(world_character: result.world_character)
    load_client_settings
  rescue EnterWorld::Error, VerifiedContent::Error, GameApi::Error => e
    @error = e.message
    @class_needs_refetch = e.is_a?(CharacterClasses::ChecksumMismatch)
    render :unavailable, layout: "application", status: :service_unavailable
  end

  def active
    world_character = @character.world_characters.find_or_create_by!(world: @world)
    world_character.update!(active: params[:active] == "true")
    redirect_back_or_to play_character_worlds_path(@character)
  end

  def version
    return redirect_to(play_character_world_path(@character, @world), alert: "Leave the world before switching versions.") if in_world?

    version = @world.released_versions.find(params[:world_version_id])
    @character.world_characters.find_or_create_by!(world: @world).update!(world_version: version)
    redirect_to play_character_world_path(@character, @world), notice: "Switched to #{version.ref}."
  end

  # The game client's "Leave World" button: frees the character's slot right
  # away, then sends the client to the world's page.
  def leave
    LeaveWorld.call(character: @character, world: @world)
    render json: {redirect_url: play_character_world_path(@character, @world)}
  rescue GameApi::Error => e
    render json: {error: e.message}, status: :service_unavailable
  end

  private

  def listed_worlds(entered_world_ids)
    World.where(id: WorldVersion.available.select(:world_id)).or(World.where(id: entered_world_ids)).order(:repo, :path)
  end

  def world_row(world, world_character)
    return if world_character && !world_character.active? && !@show_all
    {world:, world_character:, name: world.name || world.key}
  end

  def load_client_settings
    @character_settings = @character.setting_or_default.as_client_json
    @stock_assets = Content::StockAssets.client_json
  end

  def load_character
    @character = current_user.characters.find(params[:character_id])
    authorize! :read, @character
  end

  def load_world
    @world = World.find(params[:id])
  end

  # Whether the character has a live slot in one of this world's zones.
  def in_world?
    session = SlotSession.find_by(character: @character)
    session&.zone&.world_version&.world_id == @world.id
  end
end
