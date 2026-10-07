# A character's active quests in a world, for the game client's quest log.
class Play::CharacterQuestsController < Play::BaseController
  before_action :load_character

  def index
    world_character = @character.world_characters.find_by(world: World.find(params[:world_id]))
    quests = world_character ? world_character.character_quests.includes(:quest_progresses).order(:created_at) : []
    render json: {quests: quests.map { |quest| CharacterQuestJson.call(quest) }}
  end

  private

  def load_character
    @character = current_user.characters.find(params[:character_id])
    authorize! :read, @character
  end
end
