require "rails_helper"

RSpec.describe CharacterItem, type: :model do
  let(:world_character) { create(:world_character) }
  let(:zone) { create(:zone) }

  describe "associations" do
    it "destroys its equipped_item when destroyed" do
      item = create(:character_item, world_character: world_character)
      create(:equipped_item, world_character: world_character, character_item: item, equipped_slot: "head")
      expect { item.destroy }.to change(EquippedItem, :count).by(-1)
    end
  end

  describe "#provenance_label" do
    it "names the world and version it was acquired in" do
      version = create(:world_version, ref: "small/v3")
      version.world.update!(name: "Small")
      expect(build(:character_item, world_version: version).provenance_label).to eq("Small (small/v3)")
    end

    it "calls versionless items trainee gear" do
      expect(build(:character_item, world_version: nil).provenance_label).to eq("Trainee gear")
    end
  end

  describe "validations" do
    it "is valid with all required fields" do
      expect(build(:character_item, world_character: world_character)).to be_valid
    end

    it "requires a world character" do
      item = build(:character_item)
      item.world_character = nil
      expect(item).not_to be_valid
    end

    it "allows holding one version of an item once per world character" do
      create(:character_item, world_character:, identifier: "sword", version: "v1")
      dup = build(:character_item, world_character:, identifier: "sword", version: "v1")
      expect(dup).not_to be_valid
      expect(build(:character_item, world_character:, identifier: "sword", version: "v2")).to be_valid
    end

    it "allows the same item on different world characters" do
      other = create(:world_character, character: world_character.character)
      create(:character_item, world_character:, identifier: "sword", version: "v1")
      expect(build(:character_item, world_character: other, identifier: "sword", version: "v1")).to be_valid
    end

    it "requires identifier" do
      item = build(:character_item, world_character: world_character, identifier: nil)
      expect(item).not_to be_valid
      expect(item.errors[:identifier]).to be_present
    end

    it "requires name" do
      item = build(:character_item, world_character: world_character, name: nil)
      expect(item).not_to be_valid
      expect(item.errors[:name]).to be_present
    end

    it "requires elvl" do
      item = build(:character_item, world_character: world_character, elvl: nil)
      expect(item).not_to be_valid
      expect(item.errors[:elvl]).to be_present
    end

    it "requires elvl to be a non-negative integer" do
      item = build(:character_item, world_character: world_character, elvl: -1)
      expect(item).not_to be_valid
    end

    it "allows elvl of 0" do
      item = build(:character_item, world_character: world_character, elvl: 0)
      expect(item).to be_valid
    end

    it "requires a valid slot" do
      item = build(:character_item, world_character: world_character, slot: "foot")
      expect(item).not_to be_valid
      expect(item.errors[:slot]).to be_present
    end

    it "accepts all defined slots" do
      CharacterItem::SLOTS.each do |slot|
        item = build(:character_item, world_character: world_character, slot: slot)
        expect(item).to be_valid, "expected slot '#{slot}' to be valid"
      end
    end

    it "requires secondary_stats to be an array" do
      item = build(:character_item, world_character: world_character, secondary_stats: "crit_rating")
      expect(item).not_to be_valid
      expect(item.errors[:secondary_stats]).to include("must be an array")
    end

    it "requires source_json" do
      item = build(:character_item, world_character: world_character, source_json: nil)
      expect(item).not_to be_valid
      expect(item.errors[:source_json]).to be_present
    end

    it "allows a nil primary_stat" do
      item = build(:character_item, world_character: world_character, primary_stat: nil)
      expect(item).to be_valid
    end

    it "accepts all defined primary stats" do
      CharacterItem::PRIMARY_STATS.each do |stat|
        item = build(:character_item, world_character: world_character, primary_stat: stat)
        expect(item).to be_valid, "expected primary_stat '#{stat}' to be valid"
      end
    end

    it "rejects an unrecognized primary_stat" do
      item = build(:character_item, world_character: world_character, primary_stat: "defence_rating")
      expect(item).not_to be_valid
      expect(item.errors[:primary_stat]).to be_present
    end

    it "defaults secondary_stats to an empty array" do
      item = build(:character_item, world_character: world_character)
      expect(item.secondary_stats).to eq([])
    end

    it "accepts all defined secondary stats" do
      item = build(:character_item, world_character: world_character, secondary_stats: CharacterItem::SECONDARY_STATS)
      expect(item).to be_valid
    end

    it "rejects an unrecognized secondary stat" do
      item = build(:character_item, world_character: world_character, secondary_stats: ["weapon_dps"])
      expect(item).not_to be_valid
      expect(item.errors[:secondary_stats]).to be_present
    end
  end
end
