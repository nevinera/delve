FactoryBot.define do
  factory :github_installation do
    association :user
    sequence(:installation_id) { |n| n }
    repo_full_name { "nevinera/delve-content" }
    access_token { "gho_faketoken" }
    refresh_token { "ghr_fakerefreshtoken" }
    access_token_expires_at { 8.hours.from_now }
    refresh_token_expires_at { 6.months.from_now }
  end
end
