require "rails_helper"

RSpec.describe EquipItem do
  let(:character) { create(:character) }

  def call(item, slot) = described_class.call(character_item: item, equipped_slot: slot)

  describe "#call" do
    context "when the slot is empty" do
      let(:item) { create(:character_item, character: character, slot: "head") }

      it "returns a new EquippedItem" do
        result = call(item, "head")
        expect(result).to be_a(EquippedItem)
        expect(result).to be_persisted
      end

      it "equips the item into the requested slot" do
        call(item, "head")
        expect(EquippedItem.last.character_item).to eq(item)
        expect(EquippedItem.last.equipped_slot).to eq("head")
      end

      it "creates one EquippedItem" do
        expect { call(item, "head") }.to change(EquippedItem, :count).by(1)
      end
    end

    context "when another item already occupies that slot" do
      let(:item) { create(:character_item, character: character, slot: "head") }
      let(:old_item) { create(:character_item, character: character, slot: "head") }
      let!(:old_placement) { create(:equipped_item, character: character, character_item: old_item, equipped_slot: "head") }

      it "replaces the occupant" do
        result = call(item, "head")
        expect(result.character_item).to eq(item)
      end

      it "unequips the old item" do
        call(item, "head")
        expect(EquippedItem.exists?(old_placement.id)).to be false
      end

      it "does not change the total count of equipped items" do
        expect { call(item, "head") }.not_to change(EquippedItem, :count)
      end
    end

    context "when the item is already equipped in a different slot" do
      let(:item) { create(:character_item, character: character, slot: "ring") }
      let!(:placement) { create(:equipped_item, character: character, character_item: item, equipped_slot: "ring_1") }

      it "moves the item to the new slot" do
        result = call(item, "ring_2")
        expect(result.equipped_slot).to eq("ring_2")
      end

      it "leaves the old slot empty" do
        call(item, "ring_2")
        expect(EquippedItem.exists?(placement.id)).to be false
      end

      it "does not change the total count of equipped items" do
        expect { call(item, "ring_2") }.not_to change(EquippedItem, :count)
      end
    end

    context "when the item is already equipped in the requested slot" do
      let(:item) { create(:character_item, character: character, slot: "head") }
      let!(:placement) { create(:equipped_item, character: character, character_item: item, equipped_slot: "head") }

      it "returns the existing placement unchanged" do
        expect(call(item, "head")).to eq(placement)
      end

      it "does not change the total count of equipped items" do
        expect { call(item, "head") }.not_to change(EquippedItem, :count)
      end
    end

    context "when the slot is incompatible with the item" do
      let(:item) { create(:character_item, character: character, slot: "chest") }

      it "raises IncompatibleSlot" do
        expect { call(item, "legs") }.to raise_error(EquipItem::IncompatibleSlot, /chest/)
      end

      it "does not create an EquippedItem" do
        expect do
          call(item, "legs")
        rescue EquipItem::IncompatibleSlot
          nil
        end.not_to change(EquippedItem, :count)
      end
    end
  end
end
