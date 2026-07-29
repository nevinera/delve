FactoryBot.define do
  factory :character_item do
    association :character
    association :provenance_zone, factory: :zone

    sequence(:identifier) { |n| "item-#{n}" }
    sequence(:source_key) { |n| "zone_a/1.0/item-#{n}" }
    name { "Iron Sword" }
    ilvl { 584 }
    slot { "head" }
    received_at { Time.current }
    source_json { {"identifier" => identifier, "name" => name, "slot" => slot} }
  end
end
