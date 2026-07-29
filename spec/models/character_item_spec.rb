require "rails_helper"

RSpec.describe CharacterItem, type: :model do
  let(:character) { create(:character) }
  let(:zone) { create(:zone) }

  describe "validations" do
    it "is valid with all required fields" do
      expect(build(:character_item, character: character, provenance_zone: zone)).to be_valid
    end

    it "requires a character" do
      item = build(:character_item, provenance_zone: zone)
      item.character = nil
      expect(item).not_to be_valid
    end

    it "requires a provenance_zone" do
      item = build(:character_item, character: character)
      item.provenance_zone = nil
      expect(item).not_to be_valid
    end

    it "requires source_key" do
      item = build(:character_item, character: character, provenance_zone: zone, source_key: nil)
      expect(item).not_to be_valid
      expect(item.errors[:source_key]).to be_present
    end

    it "requires source_key to be unique per character" do
      create(:character_item, character: character, provenance_zone: zone, source_key: "zone_a/1.0/sword")
      item = build(:character_item, character: character, provenance_zone: zone, source_key: "zone_a/1.0/sword")
      expect(item).not_to be_valid
      expect(item.errors[:source_key]).to be_present
    end

    it "allows the same source_key on different characters" do
      other = create(:character)
      create(:character_item, character: character, provenance_zone: zone, source_key: "zone_a/1.0/sword")
      item = build(:character_item, character: other, provenance_zone: zone, source_key: "zone_a/1.0/sword")
      expect(item).to be_valid
    end

    it "requires identifier" do
      item = build(:character_item, character: character, provenance_zone: zone, identifier: nil)
      expect(item).not_to be_valid
      expect(item.errors[:identifier]).to be_present
    end

    it "requires name" do
      item = build(:character_item, character: character, provenance_zone: zone, name: nil)
      expect(item).not_to be_valid
      expect(item.errors[:name]).to be_present
    end

    it "requires ilvl" do
      item = build(:character_item, character: character, provenance_zone: zone, ilvl: nil)
      expect(item).not_to be_valid
      expect(item.errors[:ilvl]).to be_present
    end

    it "requires ilvl to be a non-negative integer" do
      item = build(:character_item, character: character, provenance_zone: zone, ilvl: -1)
      expect(item).not_to be_valid
    end

    it "allows ilvl of 0" do
      item = build(:character_item, character: character, provenance_zone: zone, ilvl: 0)
      expect(item).to be_valid
    end

    it "requires a valid slot" do
      item = build(:character_item, character: character, provenance_zone: zone, slot: "foot")
      expect(item).not_to be_valid
      expect(item.errors[:slot]).to be_present
    end

    it "accepts all defined slots" do
      CharacterItem::SLOTS.each do |slot|
        item = build(:character_item, character: character, provenance_zone: zone, slot: slot)
        expect(item).to be_valid, "expected slot '#{slot}' to be valid"
      end
    end

    it "requires received_at" do
      item = build(:character_item, character: character, provenance_zone: zone, received_at: nil)
      expect(item).not_to be_valid
      expect(item.errors[:received_at]).to be_present
    end

    it "requires source_json" do
      item = build(:character_item, character: character, provenance_zone: zone, source_json: nil)
      expect(item).not_to be_valid
      expect(item.errors[:source_json]).to be_present
    end

    it "rejects negative stat values" do
      item = build(:character_item, character: character, provenance_zone: zone, strength: -1)
      expect(item).not_to be_valid
      expect(item.errors[:strength]).to be_present
    end

    it "rejects negative weapon_dps" do
      item = build(:character_item, character: character, provenance_zone: zone, weapon_dps: -1)
      expect(item).not_to be_valid
      expect(item.errors[:weapon_dps]).to be_present
    end

    it "allows weapon_dps to be nil" do
      item = build(:character_item, character: character, provenance_zone: zone, weapon_dps: nil)
      expect(item).to be_valid
    end

    it "is valid with no stats at all" do
      item = build(:character_item, character: character, provenance_zone: zone,
        weapon_dps: nil, **CharacterItem::STAT_COLUMNS.index_with(nil))
      expect(item).to be_valid
    end

    it "returns 0 for absent stat columns" do
      item = build(:character_item, character: character, provenance_zone: zone, strength: nil)
      expect(item.strength).to eq(0)
    end
  end
end
