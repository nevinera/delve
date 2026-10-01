FactoryBot.define do
  factory :character_item do
    world_character

    sequence(:identifier) { |n| "item-#{n}" }
    zone_identifier { "zone_a" }
    version { "1.0" }
    name { "Iron Sword" }
    elvl { 584 }
    slot { "head" }
    source_json { {"identifier" => identifier, "name" => name, "slot" => slot} }
  end
end
