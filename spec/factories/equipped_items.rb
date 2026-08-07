FactoryBot.define do
  factory :equipped_item do
    association :character
    association :character_item

    equipped_slot { character_item.slot }
  end
end
