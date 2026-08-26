require "rails_helper"

RSpec.describe EquippedItems::ForCharacter do
  let(:character) { create(:character) }

  it "returns an empty hash when nothing is equipped" do
    expect(described_class.call(character: character)).to eq({})
  end

  it "keys provenance by equipped slot" do
    item = create(:character_item, character: character, slot: "head",
      identifier: "helm-of-doom", source_key: "zone_a/1.0/helm-of-doom",
      zone_identifier: "zone_a", version: "1.0", elvl: 584,
      primary_stat: "strength", secondary_stats: ["crit_rating"])
    create(:equipped_item, character: character, character_item: item, equipped_slot: "head")

    result = described_class.call(character: character)["head"]
    expect(result).to include(
      identifier: "helm-of-doom",
      source_key: "zone_a/1.0/helm-of-doom",
      zone_identifier: "zone_a",
      version: "1.0",
      slot: "head",
      elvl: 584,
      shield: false,
      primary_stat: "strength",
      secondary_stats: ["crit_rating"]
    )
    expect(result[:stats]).to eq(ItemStats::Raw.call(character_item: item))
  end

  it "reports shield: true for a shield item" do
    item = create(:character_item, character: character, slot: "off_hand",
      source_json: {"identifier" => "buckler", "name" => "Buckler", "slot" => "off_hand", "shield" => true})
    create(:equipped_item, character: character, character_item: item, equipped_slot: "off_hand")

    expect(described_class.call(character: character)["off_hand"][:shield]).to eq(true)
  end

  it "includes every equipped slot" do
    head_item = create(:character_item, character: character, slot: "head")
    chest_item = create(:character_item, character: character, slot: "chest")
    create(:equipped_item, character: character, character_item: head_item, equipped_slot: "head")
    create(:equipped_item, character: character, character_item: chest_item, equipped_slot: "chest")

    expect(described_class.call(character: character).keys).to contain_exactly("head", "chest")
  end
end
