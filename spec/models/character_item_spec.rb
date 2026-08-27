require "rails_helper"

RSpec.describe CharacterItem, type: :model do
  let(:character) { create(:character) }
  let(:zone) { create(:zone) }

  describe "associations" do
    it "destroys its equipped_item when destroyed" do
      item = create(:character_item, character: character, provenance_zone: zone)
      create(:equipped_item, character: character, character_item: item, equipped_slot: "head")
      expect { item.destroy }.to change(EquippedItem, :count).by(-1)
    end
  end

  describe "validations" do
    it "is valid with all required fields" do
      expect(build(:character_item, character: character, provenance_zone: zone)).to be_valid
    end

    it "requires a character" do
      item = build(:character_item, provenance_zone: zone)
      item.character = nil
      expect(item).not_to be_valid
    end

    it "allows a nil provenance_zone, for Trainee Gear which comes from no zone" do
      item = build(:character_item, character: character)
      item.provenance_zone = nil
      expect(item).to be_valid
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

    it "requires elvl" do
      item = build(:character_item, character: character, provenance_zone: zone, elvl: nil)
      expect(item).not_to be_valid
      expect(item.errors[:elvl]).to be_present
    end

    it "requires elvl to be a non-negative integer" do
      item = build(:character_item, character: character, provenance_zone: zone, elvl: -1)
      expect(item).not_to be_valid
    end

    it "allows elvl of 0" do
      item = build(:character_item, character: character, provenance_zone: zone, elvl: 0)
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

    it "allows a nil primary_stat" do
      item = build(:character_item, character: character, provenance_zone: zone, primary_stat: nil)
      expect(item).to be_valid
    end

    it "accepts all defined primary stats" do
      CharacterItem::PRIMARY_STATS.each do |stat|
        item = build(:character_item, character: character, provenance_zone: zone, primary_stat: stat)
        expect(item).to be_valid, "expected primary_stat '#{stat}' to be valid"
      end
    end

    it "rejects an unrecognized primary_stat" do
      item = build(:character_item, character: character, provenance_zone: zone, primary_stat: "defence_rating")
      expect(item).not_to be_valid
      expect(item.errors[:primary_stat]).to be_present
    end

    it "defaults secondary_stats to an empty array" do
      item = build(:character_item, character: character, provenance_zone: zone)
      expect(item.secondary_stats).to eq([])
    end

    it "accepts all defined secondary stats" do
      item = build(:character_item, character: character, provenance_zone: zone, secondary_stats: CharacterItem::SECONDARY_STATS)
      expect(item).to be_valid
    end

    it "rejects an unrecognized secondary stat" do
      item = build(:character_item, character: character, provenance_zone: zone, secondary_stats: ["weapon_dps"])
      expect(item).not_to be_valid
      expect(item.errors[:secondary_stats]).to be_present
    end
  end
end
