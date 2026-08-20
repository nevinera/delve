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
  end
end
