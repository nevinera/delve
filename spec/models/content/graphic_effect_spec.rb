require "rails_helper"

RSpec.describe Content::GraphicEffect do
  let(:sprite_hash) do
    {
      "sourceURL" => "../graphics/animations/firebolt.sprites2x2.png",
      "duration" => 0.5,
      "from" => "self",
      "to" => "affected",
      "when" => "immediate",
      "condition" => "always",
      "spriteColumns" => 2,
      "spriteRows" => 2,
      "spriteFrameRate" => 8
    }
  end

  let(:plain_hash) do
    {
      "sourceURL" => "../graphics/effects/recover-glow.webp",
      "duration" => 1.4,
      "from" => "self",
      "to" => "self",
      "when" => "immediate",
      "condition" => "always",
      "color" => "#00ff00",
      "scale" => 2.2
    }
  end

  it "round-trips a sprite-sheet graphic effect" do
    effect = described_class.from_h(sprite_hash)
    expect(effect).to be_valid
    expect(effect.to_h).to eq(sprite_hash)
  end

  it "round-trips a plain graphic effect with color/scale" do
    effect = described_class.from_h(plain_hash)
    expect(effect).to be_valid
    expect(effect.to_h).to eq(plain_hash)
  end

  it "is invalid without a required field" do
    effect = described_class.from_h(plain_hash.except("duration"))
    expect(effect).not_to be_valid
    expect(effect.errors[:duration]).not_to be_empty
  end

  it "rejects an unknown from/to/when/condition value" do
    effect = described_class.from_h(plain_hash.merge("when" => "bogus"))
    expect(effect).not_to be_valid
    expect(effect.errors[:when]).not_to be_empty
  end
end
