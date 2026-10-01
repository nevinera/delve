FactoryBot.define do
  factory :world_version do
    world
    sequence(:ref) { |n| "v#{n}" }
    commit_sha { "0123456789abcdef0123456789abcdef01234567" }
    raw_base_url { "https://raw.githubusercontent.com/#{world.repo}/#{commit_sha}/" }
    state { "unreleased" }

    trait :importing do
      state { "importing" }
    end

    trait :released do
      state { "released" }
      released_at { Time.current }
    end
  end
end
