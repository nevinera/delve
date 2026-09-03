require "rails_helper"

RSpec.describe Content::Effect::Heal do
  it "round-trips a self-targeted heal without a range" do
    hash = {"type" => "heal", "affects" => "self", "amount" => 20.0}
    effect = described_class.build_from_h(hash)
    expect(effect).to be_valid
    expect(effect.to_h).to eq(hash)
  end

  it "requires a range when not self-targeted" do
    hash = {"type" => "heal", "affects" => "bTarget", "amount" => 20.0}
    effect = described_class.build_from_h(hash)
    expect(effect).not_to be_valid
    expect(effect.errors[:range_min]).not_to be_empty
  end

  it "round-trips a ranged, non-self heal" do
    hash = {"type" => "heal", "affects" => "bAll", "amount" => 20.0, "range" => [5.0, 10.0]}
    effect = described_class.build_from_h(hash)
    expect(effect).to be_valid
    expect(effect.to_h).to eq(hash)
  end
end
