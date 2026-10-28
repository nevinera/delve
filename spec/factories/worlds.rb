FactoryBot.define do
  factory :world do
    association :user
    sequence(:repo) { |n| "octocat/world-#{n}" }
    default_branch { "main" }
    opened_at { Time.current }
  end
end
