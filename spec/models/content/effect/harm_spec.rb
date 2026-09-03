require "rails_helper"

RSpec.describe Content::Effect::Harm do
  let(:hash) do
    {"type" => "harm", "affects" => "bTarget", "amount" => [89.0, 140.0], "range" => 5.0, "tags" => ["physical", "melee"]}
  end

  it "round-trips, collapsing a min==max range to a scalar" do
    effect = described_class.build_from_h(hash)
    expect(effect).to be_valid
    expect(effect.to_h).to eq(hash)
  end

  it "rejects self as a harm target" do
    effect = described_class.build_from_h(hash.merge("affects" => "self"))
    expect(effect).not_to be_valid
    expect(effect.errors[:affects]).not_to be_empty
  end
end
