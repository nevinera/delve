FactoryBot.define do
  factory :handle do
    association :user
    sequence(:identifier) { |n| "handle_#{n.to_s.rjust(3, "0")}" }
    description { nil }
  end
end
