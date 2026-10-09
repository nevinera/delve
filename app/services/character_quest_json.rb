# The JSON shape of an active quest, for the game server and client: its
# structure (no prose; see CharacterQuest) and each objective's progress,
# in order.
module CharacterQuestJson
  module_function

  def call(quest)
    {
      quest_identifier: quest.quest_identifier,
      world_version_id: quest.world_version_id&.to_s,
      timer_elapsed_seconds: quest.timer_elapsed_seconds,
      definition: quest.definition,
      objectives: quest.quest_progresses.map do |progress|
        {hash: progress.objective_hash, objective: progress.objective, count: progress.count, required: progress.required}
      end
    }
  end
end
