FactoryBot.define do
  factory :character_item do
    world_character

    sequence(:identifier) { |n| "item-#{n}" }
    zone_identifier { "zone_a" }
    version { "1.0" }
    sequence(:source_key) { |n| "zone_a/item-#{n}/1.0" }
    name { "Iron Sword" }
    elvl { 584 }
    slot { "head" }
    received_at { Time.current }
    source_json { {"identifier" => identifier, "name" => name, "slot" => slot} }
  end
end
