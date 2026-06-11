FactoryBot.define do
  factory :character do
    association :user
    association :character_class
    sequence(:name) { |n| "Heroic-#{"AA".chars.map { |c| ((c.ord - 65 + n) % 26 + 65).chr }.join}" }
    time_logged { 0 }
  end
end
