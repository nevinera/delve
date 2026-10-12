# The JSON shape of an active quest, for the game server and client: its
# structure (no prose; see CharacterQuest) and each objective's progress,
# in order (a use objective's with the interactables used).
module CharacterQuestJson
  module_function

  def call(quest)
    {
      quest_identifier: quest.quest_identifier,
      world_version_id: quest.world_version_id&.to_s,
      timer_elapsed_seconds: quest.timer_elapsed_seconds,
      definition: quest.definition,
      objectives: quest.quest_progresses.map { |progress| objective(progress) }
    }
  end

  def objective(progress)
    json = {hash: progress.objective_hash, objective: progress.objective, count: progress.count, required: progress.required}
    progress.use? ? json.merge(used: progress.used) : json
  end
end
