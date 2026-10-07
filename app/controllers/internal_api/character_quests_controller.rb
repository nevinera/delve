# The game server's quest calls (see plans/quests.md): a world character's
# active quests, and accepting, syncing, progressing, completing and failing
# one. The game server owns the quest rules (requirements, objectives,
# timers) and supplies quest definitions; Rails keeps the state.
class InternalApi::CharacterQuestsController < InternalApi::BaseController
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from CharacterQuest::Error, with: :render_unprocessable
  rescue_from ActiveRecord::RecordInvalid, AwardCharacterItem::Error, WorldContent::Error, with: :render_unprocessable

  before_action :load_world_character
  before_action :load_quest, only: [:update, :sync, :complete, :destroy]

  def index
    quests = @world_character.character_quests.includes(:quest_progresses).order(:created_at)
    render json: {quests: quests.map { |quest| CharacterQuestJson.call(quest) }}
  end

  # Accepts a quest, given its definition (a quests-file entry). Idempotent:
  # accepting an active quest returns it unchanged.
  def create
    quest = CharacterQuest.accept!(@world_character, definition_param)
    render json: {quest: CharacterQuestJson.call(quest)}, status: :created
  end

  # Moves the quest to a newer definition (from the world character's
  # current version), keeping progress on unchanged objectives.
  def sync
    @quest.sync!(definition_param)
    render json: {quest: CharacterQuestJson.call(@quest)}
  end

  # Sets objective counts ({progress: {hash => count}}) and the timer, both
  # absolute.
  def update
    CharacterQuest.transaction do
      @quest.record_progress!(progress_params)
      @quest.update!(timer_elapsed_seconds: params[:timer_elapsed_seconds]) if params.key?(:timer_elapsed_seconds)
    end
    render json: {quest: CharacterQuestJson.call(@quest.reload)}
  end

  # Completes the quest from its stored definition: grants its flags,
  # awards its rewards, and ends it. Returns {flags, items}.
  def complete
    render json: @quest.complete!
  end

  # Fails the quest. Idempotent.
  def destroy
    @quest&.destroy!
    head :no_content
  end

  private

  def load_world_character
    @world_character = WorldCharacter.find(params[:world_character_id])
  end

  def load_quest
    @quest = @world_character.character_quests.find_by(quest_identifier: params[:quest_identifier])
    render_not_found("no active quest #{params[:quest_identifier]}") if @quest.nil? && action_name != "destroy"
  end

  def definition_param
    definition = params.require(:quest)
    raise ActionController::BadRequest, "quest must be an object" unless definition.is_a?(ActionController::Parameters)
    definition.permit!.to_h
  end

  def progress_params
    params.fetch(:progress, {}).permit!.to_h.transform_values(&:to_i)
  end

  def render_unprocessable(err)
    render json: {error: err.is_a?(Exception) ? err.message : err}, status: :unprocessable_content
  end

  def render_not_found(err)
    render json: {error: err.is_a?(Exception) ? err.message : err}, status: :not_found
  end
end
