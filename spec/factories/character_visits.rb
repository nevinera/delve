FactoryBot.define do
  factory :character_visit do
    world_character
    zone_identifier { "darkwood" }
    map_identifier { "" }
    place_identifier { "" }
  end
end
