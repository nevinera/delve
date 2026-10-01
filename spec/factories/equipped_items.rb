FactoryBot.define do
  factory :equipped_item do
    character_item
    world_character { character_item.world_character }

    equipped_slot { character_item.slot }
  end
end
