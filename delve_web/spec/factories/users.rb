FactoryBot.define do
  factory :user do
    sequence(:email) { |n| "user#{n}@example.com" }
    sequence(:uid)   { |n| "google_uid_#{n}" }
    provider { "google_oauth2" }
    name { "Test User" }
  end
end
