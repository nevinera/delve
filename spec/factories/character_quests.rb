FactoryBot.define do
  factory :character_quest do
    world_character
    world_version { world_character.world_version }
    sequence(:quest_identifier) { |n| "quest-#{n}" }
  end

  factory :quest_progress do
    character_quest
    sequence(:objective_hash) { |n| Digest::SHA1.hexdigest(n.to_s) }
    count { 1 }
  end
end
