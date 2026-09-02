require "rails_helper"

RSpec.describe Content::Effect::Resource do
  it "round-trips a self-targeted resource effect without a range" do
    hash = {"type" => "resource", "affects" => "self", "resourceName" => "energy", "delta" => 10.0}
    effect = described_class.build_from_h(hash)
    expect(effect).to be_valid
    expect(effect.to_h).to eq(hash)
  end

  it "requires a range when not self-targeted" do
    hash = {"type" => "resource", "affects" => "bTarget", "resourceName" => "energy", "delta" => 10.0}
    effect = described_class.build_from_h(hash)
    expect(effect).not_to be_valid
    expect(effect.errors[:range_min]).not_to be_empty
  end
end
