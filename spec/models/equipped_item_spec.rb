require "rails_helper"

RSpec.describe EquippedItem, type: :model do
  let(:character) { create(:character) }
  let(:character_item) { create(:character_item, character: character, slot: "head") }

  describe "validations" do
    it "is valid with all required fields" do
      expect(build(:equipped_item, character: character, character_item: character_item, equipped_slot: "head")).to be_valid
    end

    it "requires equipped_slot" do
      expect(build(:equipped_item, character: character, character_item: character_item, equipped_slot: nil)).not_to be_valid
    end

    it "rejects an unknown equipped_slot" do
      expect(build(:equipped_item, character: character, character_item: character_item, equipped_slot: "teeth")).not_to be_valid
    end

    it "enforces uniqueness of equipped_slot per character" do
      create(:equipped_item, character: character, character_item: character_item, equipped_slot: "head")
      item2 = create(:character_item, character: character, slot: "head")
      expect(build(:equipped_item, character: character, character_item: item2, equipped_slot: "head")).not_to be_valid
    end

    it "enforces uniqueness of character_item_id" do
      create(:equipped_item, character: character, character_item: character_item, equipped_slot: "head")
      expect(build(:equipped_item, character: character, character_item: character_item, equipped_slot: "head")).not_to be_valid
    end

    describe "slot compatibility" do
      it "accepts a ring item in ring_1" do
        item = create(:character_item, character: character, slot: "ring")
        expect(build(:equipped_item, character: character, character_item: item, equipped_slot: "ring_1")).to be_valid
      end

      it "accepts a ring item in ring_2" do
        item = create(:character_item, character: character, slot: "ring")
        expect(build(:equipped_item, character: character, character_item: item, equipped_slot: "ring_2")).to be_valid
      end

      it "rejects a ring item in a non-ring slot" do
        item = create(:character_item, character: character, slot: "ring")
        expect(build(:equipped_item, character: character, character_item: item, equipped_slot: "head")).not_to be_valid
      end

      it "accepts a one_hand item in main_hand" do
        item = create(:character_item, character: character, slot: "one_hand")
        expect(build(:equipped_item, character: character, character_item: item, equipped_slot: "main_hand")).to be_valid
      end

      it "accepts a one_hand item in off_hand" do
        item = create(:character_item, character: character, slot: "one_hand")
        expect(build(:equipped_item, character: character, character_item: item, equipped_slot: "off_hand")).to be_valid
      end

      it "accepts a two_hand item in main_hand" do
        item = create(:character_item, character: character, slot: "two_hand")
        expect(build(:equipped_item, character: character, character_item: item, equipped_slot: "main_hand")).to be_valid
      end

      it "rejects a two_hand item in off_hand" do
        item = create(:character_item, character: character, slot: "two_hand")
        expect(build(:equipped_item, character: character, character_item: item, equipped_slot: "off_hand")).not_to be_valid
      end

      it "rejects a chest item in a leg slot" do
        item = create(:character_item, character: character, slot: "chest")
        expect(build(:equipped_item, character: character, character_item: item, equipped_slot: "legs")).not_to be_valid
      end
    end
  end

  describe "associations" do
    it "is destroyed when the character is destroyed" do
      create(:equipped_item, character: character, character_item: character_item, equipped_slot: "head")
      expect { character.destroy }.to change(EquippedItem, :count).by(-1)
    end

    it "is destroyed when the character_item is destroyed" do
      create(:equipped_item, character: character, character_item: character_item, equipped_slot: "head")
      expect { character_item.destroy }.to change(EquippedItem, :count).by(-1)
    end
  end
end
