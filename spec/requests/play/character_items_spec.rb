require "rails_helper"

RSpec.describe "Play::CharacterItems", type: :request do
  let(:user) { create(:user) }
  let!(:character) { create(:character, user: user) }

  before { sign_in user }

  describe "GET /play/characters/:character_id/character_items/:id" do
    context "when the item has a single equippable slot" do
      let(:item) { create(:character_item, character: character, slot: "head") }

      it "offers a single equip button" do
        get "/play/characters/#{character.id}/character_items/#{item.id}"
        expect(response.body).to include("Equip as Head")
        expect(response.body).not_to include("Equip as Left Ring")
      end
    end

    context "when the item can go in either of two slots" do
      let(:item) { create(:character_item, character: character, slot: "ring") }

      it "offers a button for each compatible slot" do
        get "/play/characters/#{character.id}/character_items/#{item.id}"
        expect(response.body).to include("Equip as Left Ring")
        expect(response.body).to include("Equip as Right Ring")
      end
    end

    context "when the item is a two_hand weapon" do
      let(:item) { create(:character_item, character: character, slot: "two_hand") }

      it "only offers Main Hand, not Off Hand" do
        get "/play/characters/#{character.id}/character_items/#{item.id}"
        expect(response.body).to include("Equip as Main Hand")
        expect(response.body).not_to include("Equip as Off Hand")
      end
    end

    context "when the item is already equipped" do
      let(:item) { create(:character_item, character: character, slot: "ring") }

      before { create(:equipped_item, character: character, character_item: item, equipped_slot: "ring_2") }

      it "offers an unequip button instead of equip buttons" do
        get "/play/characters/#{character.id}/character_items/#{item.id}"
        expect(response.body).to include("Unequip from Right Ring")
        expect(response.body).not_to include("Equip as Left Ring")
        expect(response.body).not_to include("Equip as Right Ring")
      end
    end
  end

  describe "GET /play/characters/:character_id/character_items" do
    let!(:head_item) { create(:character_item, character: character, slot: "head", name: "Helm of Whatever") }
    let!(:chest_item) { create(:character_item, character: character, slot: "chest", name: "Robe of Whatever") }

    context "without a slot filter" do
      it "lists every item" do
        get "/play/characters/#{character.id}/character_items"
        expect(response.body).to include("Helm of Whatever")
        expect(response.body).to include("Robe of Whatever")
      end
    end

    context "with a single slot filter" do
      it "only lists items matching that slot" do
        get "/play/characters/#{character.id}/character_items", params: {slot: "head"}
        expect(response.body).to include("Helm of Whatever")
        expect(response.body).not_to include("Robe of Whatever")
      end
    end

    context "with multiple slots filtered (e.g. one_hand/two_hand for a weapon slot)" do
      let!(:one_hand_item) { create(:character_item, character: character, slot: "one_hand", name: "Dagger of Whatever") }
      let!(:two_hand_item) { create(:character_item, character: character, slot: "two_hand", name: "Greatsword of Whatever") }

      it "lists items matching any of the given slots" do
        get "/play/characters/#{character.id}/character_items", params: {slot: %w[main_hand one_hand two_hand]}
        expect(response.body).to include("Dagger of Whatever")
        expect(response.body).to include("Greatsword of Whatever")
        expect(response.body).not_to include("Helm of Whatever")
      end
    end
  end
end
