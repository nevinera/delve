FactoryBot.define do
  factory :world_import do
    association :world
    tag { "v1" }
  end
end
