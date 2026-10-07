FactoryBot.define do
  factory :character_quest do
    world_character
    world_version { world_character.world_version }
    sequence(:quest_identifier) { |n| "quest-#{n}" }
  end

  factory :quest_progress do
    character_quest
    sequence(:position)
    objective { {"type" => "talk", "zone" => "cave", "ncu" => "ncu-#{position}"} }
    objective_hash { QuestObjective.hash_of(objective) }
    count { 0 }
  end
end
