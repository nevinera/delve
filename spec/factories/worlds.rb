FactoryBot.define do
  factory :world do
    sequence(:identifier) do |n|
      suffix = +""
      m = n
      while m > 0
        suffix.prepend(("a".ord + (m - 1) % 26).chr)
        m = (m - 1) / 26
      end
      "world_#{suffix}"
    end
    name { "Test World" }
    description { nil }
  end

  factory :world_version do
    association :world
    association :registering_user, factory: :user
    sequence(:version) { |n| "1.#{n}" }
    config_url { "https://example.com/worlds/test.json" }
    state { "fetched" }
  end

  factory :character_world do
    association :character
    association :world
    entered_at { Time.current }
  end

  factory :character_tag do
    association :character_world
    sequence(:name) { |n| "tag-#{n}" }
    granted_version { "1.0" }
  end
end
