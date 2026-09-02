require "rails_helper"

RSpec.describe Content::Effect::Status do
  it "round-trips a self-targeted status effect without a range" do
    hash = {"type" => "status", "affects" => "self", "duration" => 5.0, "status" => {"name" => "Focused", "treatAs" => "buff", "stacking" => "extend", "effects" => []}}
    effect = described_class.build_from_h(hash)
    expect(effect).to be_valid
    expect(effect.to_h).to eq(hash)
  end

  it "requires a range when not self-targeted" do
    hash = {"type" => "status", "affects" => "bTarget", "duration" => 5.0, "status" => {}}
    effect = described_class.build_from_h(hash)
    expect(effect).not_to be_valid
    expect(effect.errors[:range_min]).not_to be_empty
  end
end
