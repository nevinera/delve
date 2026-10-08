# A character's active quests in a world, for the game client's quest log,
# with the names of the zones in the character's world version.
class Play::CharacterQuestsController < Play::BaseController
  before_action :load_character

  def index
    world_character = @character.world_characters.find_by(world: World.find(params[:world_id]))
    quests = world_character ? world_character.character_quests.includes(:quest_progresses).order(:created_at) : []
    render json: {quests: quests.map { |quest| CharacterQuestJson.call(quest) }, zone_names: zone_names(world_character)}
  end

  private

  # {identifier: name} for the zones of the character's world version,
  # falling back to identifiers for zones imported before names were kept.
  def zone_names(world_character)
    zones = world_character&.world_version&.zones || Zone.none
    zones.pluck(:identifier, :name).to_h { |identifier, name| [identifier, name.presence || identifier] }
  end

  def load_character
    @character = current_user.characters.find(params[:character_id])
    authorize! :read, @character
  end
end
