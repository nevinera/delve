FactoryBot.define do
  factory :character_class do
    association :user, factory: :user, handle: "testuser"
    sequence(:identifier) { |n| "testuser/class_#{n}" }
    location { "https://github.com/example/delve/blob/main/docs/examples/classes/puncher.json" }
    definition { {"name" => "Puncher", "description" => "A punching class"} }
  end
end
