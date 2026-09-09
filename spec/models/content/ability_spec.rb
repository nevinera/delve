require "rails_helper"

RSpec.describe Content::Ability do
  let(:punch_hash) do
    {
      "name" => "Punch",
      "iconURL" => "../graphics/icons/punch.svg",
      "castTime" => nil,
      "globalCooldown" => 0.5,
      "graphicEffects" => [
        {"sourceURL" => "../graphics/effects/punch-impact.webp", "duration" => 0.3, "from" => "self", "to" => "affected", "when" => "impact", "condition" => "onHit", "color" => "#ff0000"}
      ],
      "soundEffects" => [
        {"sourceURL" => "../audio/punch.ogg", "duration" => 0.12, "location" => "affected", "when" => "impact", "condition" => "onHit", "volumeScale" => 0.1}
      ],
      "effects" => [
        {"type" => "harm", "affects" => "bTarget", "amount" => [89.0, 140.0], "range" => 5.0, "tags" => ["physical", "melee"]}
      ]
    }
  end

  it "round-trips a full ability with nested effects" do
    ability = described_class.from_h(punch_hash)
    expect(ability).to be_valid
    expect(ability.graphic_effects.first).to be_a(Content::GraphicEffect)
    expect(ability.sound_effects.first).to be_a(Content::SoundEffect)
    expect(ability.effects.first).to be_a(Content::Effect::Harm)
    expect(ability.to_h).to eq(punch_hash)
  end

  it "keeps castTime present-but-null rather than dropping the key" do
    ability = described_class.from_h(punch_hash)
    expect(ability.to_h).to have_key("castTime")
    expect(ability.to_h["castTime"]).to be_nil
  end

  it "omits cooldown/maxRange/speed/tags/description when absent from the source" do
    ability = described_class.from_h(punch_hash)
    expect(ability.to_h).not_to have_key("cooldown")
    expect(ability.to_h).not_to have_key("maxRange")
    expect(ability.to_h).not_to have_key("speed")
    expect(ability.to_h).not_to have_key("tags")
    expect(ability.to_h).not_to have_key("description")
  end

  it "round-trips a description" do
    ability = described_class.from_h(punch_hash.merge("description" => "Hurts the target."))
    expect(ability.to_h["description"]).to eq("Hurts the target.")
  end

  it "round-trips top-level tags" do
    ability = described_class.from_h(punch_hash.merge("tags" => ["harmful", "class_druid"]))
    expect(ability.to_h["tags"]).to eq(["harmful", "class_druid"])
  end

  it "is invalid without a name" do
    ability = described_class.from_h(punch_hash.except("name"))
    expect(ability).not_to be_valid
    expect(ability.errors[:name]).not_to be_empty
  end
end
