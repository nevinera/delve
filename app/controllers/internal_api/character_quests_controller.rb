# The game server's quest calls (see plans/quests.md): a world character's
# active quests, and accepting, progressing, completing and failing one.
# The game server owns the quest rules (requirements, objectives, timers);
# Rails keeps the state.
class InternalApi::CharacterQuestsController < InternalApi::BaseController
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from CharacterQuest::Error, with: :render_unprocessable
  rescue_from ActiveRecord::RecordInvalid, with: :render_unprocessable

  before_action :load_world_character
  before_action :load_quest, only: [:update, :complete, :destroy]

  def index
    quests = @world_character.character_quests.includes(:quest_progresses).order(:created_at)
    render json: {quests: quests.map { |quest| CharacterQuestJson.call(quest) }}
  end

  # Idempotent: accepting an active quest returns it unchanged.
  def create
    quest = CharacterQuest.accept!(@world_character, params.require(:quest))
    render json: {quest: CharacterQuestJson.call(quest)}, status: :created
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

  # Grants the completion flag plus grants_flags, and ends the quest.
  def complete
    flags = Array(params[:grants_flags])
    invalid = flags.reject { |flag| CharacterFlag.valid_flag?(flag) }
    return render_unprocessable("invalid flags: #{invalid.join(", ")}") if invalid.any?

    @quest.complete!(flags)
    render json: {flags: [@quest.completion_flag, *flags]}
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
