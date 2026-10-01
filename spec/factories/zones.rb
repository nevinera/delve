FactoryBot.define do
  factory :zone do
    world_version
    sequence(:identifier) { |n| "zone-#{n}" }
    path { "zones/#{identifier}/#{identifier}.full.json" }
  end
end
