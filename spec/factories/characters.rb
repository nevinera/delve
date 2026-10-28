FactoryBot.define do
  factory :character do
    association :user
    sequence(:name) { |n| "Hero#{("a".."z").to_a[n % 26]}#{("a".."z").to_a[(n / 26) % 26]}" }
    look { {} }
  end
end
