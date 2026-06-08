FactoryBot.define do
  factory :character_class do
    association :user
    association :handle
    sequence(:identifier) { |n| "class#{n.to_s.rjust(3, "0")}" }
    location { "https://github.com/example/delve/blob/main/docs/examples/classes/puncher.json" }
  end
end
