require "rails_helper"

RSpec.describe Content::SoundEffect do
  let(:hash) do
    {
      "sourceURL" => "../audio/punch.ogg",
      "duration" => 0.12,
      "location" => "affected",
      "when" => "impact",
      "condition" => "onHit",
      "volumeScale" => 0.1
    }
  end

  it "round-trips a sound effect" do
    effect = described_class.from_h(hash)
    expect(effect).to be_valid
    expect(effect.to_h).to eq(hash)
  end

  it "is invalid without a required field" do
    effect = described_class.from_h(hash.except("location"))
    expect(effect).not_to be_valid
    expect(effect.errors[:location]).not_to be_empty
  end

  it "rejects an unknown impactTiming value" do
    effect = described_class.from_h(hash.merge("impactTiming" => "bogus"))
    expect(effect).not_to be_valid
    expect(effect.errors[:impact_timing]).not_to be_empty
  end
end
