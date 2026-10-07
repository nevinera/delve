# Moves a world character's active quests onto their current world version
# (see docs/quests.md#world-versions): a quest the version no longer has is
# dropped, and progress is kept only for objectives it still has unchanged.
# Reads the version's quests file only when a quest needs moving.
class UpgradeCharacterQuests
  def self.call(world_character)
    version = world_character.world_version or return
    stale = world_character.character_quests.not_on(version)
    return if stale.none?

    quests = WorldContent.quests(version).index_by { |quest| quest["identifier"] }
    stale.each { |character_quest| upgrade(character_quest, quests[character_quest.quest_identifier], version) }
  end

  def self.upgrade(character_quest, quest, version)
    return character_quest.destroy! unless quest

    hashes = (quest["objectives"] || []).map { |objective| QuestObjective.hash_of(objective) }
    CharacterQuest.transaction do
      character_quest.quest_progresses.where.not(objective_hash: hashes).delete_all
      character_quest.update!(world_version: version)
    end
  end
  private_class_method :upgrade
end
