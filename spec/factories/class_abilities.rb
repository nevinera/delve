FactoryBot.define do
  factory :class_ability do
    association :character_class
    sequence(:position) { |n| n }
    name { "Punch" }
    icon_url { "https://example.com/icons/punch.svg" }
    global_cooldown { 1.5 }
    source_json { {"name" => "Punch"} }
  end
end
