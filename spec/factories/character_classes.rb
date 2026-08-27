FactoryBot.define do
  factory :character_class do
    association :user
    association :handle
    sequence(:identifier) { |n| "class#{n.to_s.rjust(3, "0")}" }
    version { "1.0" }
    location { "https://github.com/example/delve/blob/main/docs/examples/classes/puncher.json" }
    primary_stats { ["strength"] }
    secondary_stats { %w[stamina crit_rating haste_rating mastery_rating versatility_rating] }
    wields { %w[dagger dagger] }

    trait :hybrid do
      primary_stats { %w[strength intellect] }
    end
  end
end
