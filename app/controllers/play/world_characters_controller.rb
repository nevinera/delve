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
    worlds = World.where(id: WorldVersion.available.select(:world_id)).or(World.where(id: world_characters.keys))
    @rows = worlds.order(:repo, :path).filter_map do |world|
      world_character = world_characters[world.id]
      next if world_character && !world_character.active? && !@show_all
      {world:, world_character:, name: world.name || world.key}
    end
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
    @owned_zone_items = @character.owned_zone_items_for(@zone)
    @equipped_items = EquippedItems::ForCharacter.call(character: @character)
    @character_settings = @character.setting_or_default.as_client_json
    @stock_assets = Content::StockAssets.client_json
  rescue EnterWorld::Error, WorldContent::Error, GameApi::Error => e
    @error = e.message
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

  private

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
