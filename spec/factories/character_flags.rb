FactoryBot.define do
  factory :character_flag do
    world_character
    flag_type { "quest" }
    sequence(:identifier) { |n| "completed/quest-#{n}" }
  end
end
