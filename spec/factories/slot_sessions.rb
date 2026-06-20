FactoryBot.define do
  factory :slot_session do
    association :character
    association :zone
    token { SecureRandom.uuid }
    instance_identifier { SecureRandom.uuid }
    slot_id { SecureRandom.uuid }
    last_confirmed_at { nil }
  end
end
