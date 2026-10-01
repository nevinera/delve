FactoryBot.define do
  factory :world do
    association :owner, factory: :user
    repo { "builder/content" }
    sequence(:path) { |n| "worlds/world-#{n}.json" }
  end
end
