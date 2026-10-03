require "rails_helper"

RSpec.describe EquippedItems::ForWorldCharacter do
  let(:world_character) { create(:world_character) }

  it "returns an empty hash when nothing is equipped" do
    expect(described_class.call(world_character: world_character)).to eq({})
  end

  it "keys provenance by equipped slot" do
    item = create(:character_item, world_character: world_character, slot: "head",
      identifier: "helm-of-doom", name: "Helm of Doom",
      version: "1.0", elvl: 584,
      primary_stat: "strength", secondary_stats: ["crit_rating"])
    create(:equipped_item, world_character: world_character, character_item: item, equipped_slot: "head")

    result = described_class.call(world_character: world_character)["head"]
    expect(result).to include(
      identifier: "helm-of-doom",
      name: "Helm of Doom",
      id: item.id,
      world_version_id: nil,
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
    item = create(:character_item, world_character: world_character, slot: "off_hand",
      source_json: {"identifier" => "buckler", "name" => "Buckler", "slot" => "off_hand", "shield" => true})
    create(:equipped_item, world_character: world_character, character_item: item, equipped_slot: "off_hand")

    expect(described_class.call(world_character: world_character)["off_hand"][:shield]).to eq(true)
  end

  it "reports weapon_type for a weapon item" do
    item = create(:character_item, world_character: world_character, slot: "main_hand",
      source_json: {"identifier" => "sword-of-doom", "name" => "Sword of Doom", "slot" => "main_hand", "weaponType" => "sword"})
    create(:equipped_item, world_character: world_character, character_item: item, equipped_slot: "main_hand")

    expect(described_class.call(world_character: world_character)["main_hand"][:weapon_type]).to eq("sword")
  end

  it "reports weapon_type: nil for a non-weapon item" do
    item = create(:character_item, world_character: world_character, slot: "head")
    create(:equipped_item, world_character: world_character, character_item: item, equipped_slot: "head")

    expect(described_class.call(world_character: world_character)["head"][:weapon_type]).to be_nil
  end

  it "includes every equipped slot" do
    head_item = create(:character_item, world_character: world_character, slot: "head")
    chest_item = create(:character_item, world_character: world_character, slot: "chest")
    create(:equipped_item, world_character: world_character, character_item: head_item, equipped_slot: "head")
    create(:equipped_item, world_character: world_character, character_item: chest_item, equipped_slot: "chest")

    expect(described_class.call(world_character: world_character).keys).to contain_exactly("head", "chest")
  end
end
