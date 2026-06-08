FactoryBot.define do
  factory :zone do
    association :handle
    association :registering_user, factory: :user
    sequence(:identifier) do |n|
      suffix = +""
      m = n
      while m > 0
        suffix.prepend(("a".ord + (m - 1) % 26).chr)
        m = (m - 1) / 26
      end
      "zone_#{suffix}"
    end
    sequence(:version) { |n| "1.#{n}" }
    name { "Test Zone" }
    config_url { "https://example.com/zones/test.json" }
    description { nil }
  end
end
