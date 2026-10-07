# The JSON shape of an active quest, for the game server and client.
module CharacterQuestJson
  module_function

  def call(quest)
    {
      quest_identifier: quest.quest_identifier,
      timer_elapsed_seconds: quest.timer_elapsed_seconds,
      progress: quest.progress
    }
  end
end
