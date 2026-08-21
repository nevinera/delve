require "rails_helper"

RSpec.describe "Play::EquippedItems", type: :request do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let!(:character) { create(:character, user: user) }

  context "when not logged in" do
    it "redirects to login" do
      get "/play/characters/#{character.id}/equipped_items"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    context "with a character belonging to the current user" do
      it "returns 200" do
        get "/play/characters/#{character.id}/equipped_items"
        expect(response).to have_http_status(:ok)
      end

      it "lists equipped items" do
        item = create(:character_item, character: character, slot: "head")
        create(:equipped_item, character: character, character_item: item, equipped_slot: "head")

        get "/play/characters/#{character.id}/equipped_items"
        expect(response.body).to include(item.name)
      end

      it "shows every slot even when nothing is equipped" do
        get "/play/characters/#{character.id}/equipped_items"
        EquippedItem::SLOT_LABELS.each_value do |label|
          expect(response.body).to include(label)
        end
      end

      it "shows empty slots as empty alongside a filled slot" do
        item = create(:character_item, character: character, slot: "head")
        create(:equipped_item, character: character, character_item: item, equipped_slot: "head")

        get "/play/characters/#{character.id}/equipped_items"
        expect(response.body).to include("Empty")
      end

      it "links each row's Equippable filter to the compatible item slots" do
        get "/play/characters/#{character.id}/equipped_items"
        expect(response.body).to include(CGI.escapeHTML(play_character_character_items_path(character, slot: ["head"])))
        expect(response.body).to include(CGI.escapeHTML(play_character_character_items_path(character, slot: %w[main_hand one_hand two_hand])))
        expect(response.body).to include(CGI.escapeHTML(play_character_character_items_path(character, slot: ["ring"])))
      end
    end

    context "with a character belonging to another user" do
      let!(:other_character) { create(:character, user: other_user) }

      it "returns 404" do
        get "/play/characters/#{other_character.id}/equipped_items"
        expect(response).to have_http_status(:not_found)
      end
    end

    describe "PATCH .../equipped_items/:equipped_slot" do
      let(:item) { create(:character_item, character: character, slot: "head") }

      it "equips the item into the slot" do
        patch "/play/characters/#{character.id}/equipped_items/head", params: {character_item_id: item.id}
        expect(EquippedItem.find_by(character: character, equipped_slot: "head").character_item).to eq(item)
      end

      it "redirects to the equipped items index" do
        patch "/play/characters/#{character.id}/equipped_items/head", params: {character_item_id: item.id}
        expect(response).to redirect_to(play_character_equipped_items_path(character))
      end

      it "replaces whatever previously occupied the slot" do
        old_item = create(:character_item, character: character, slot: "head")
        create(:equipped_item, character: character, character_item: old_item, equipped_slot: "head")

        patch "/play/characters/#{character.id}/equipped_items/head", params: {character_item_id: item.id}
        expect(EquippedItem.exists?(character_item_id: old_item.id)).to be false
      end

      it "unequips the slot when character_item_id is blank" do
        create(:equipped_item, character: character, character_item: item, equipped_slot: "head")

        patch "/play/characters/#{character.id}/equipped_items/head", params: {character_item_id: ""}
        expect(EquippedItem.find_by(character: character, equipped_slot: "head")).to be_nil
      end

      it "is a no-op when unequipping an already-empty slot" do
        expect {
          patch "/play/characters/#{character.id}/equipped_items/head", params: {character_item_id: ""}
        }.not_to change(EquippedItem, :count)
        expect(response).to redirect_to(play_character_equipped_items_path(character))
      end

      it "rejects an incompatible slot" do
        chest_item = create(:character_item, character: character, slot: "chest")
        patch "/play/characters/#{character.id}/equipped_items/legs", params: {character_item_id: chest_item.id}
        expect(response).to redirect_to(play_character_equipped_items_path(character))
        expect(flash[:alert]).to be_present
      end

      it "does not equip an item belonging to another character" do
        other_character = create(:character, user: user)
        other_item = create(:character_item, character: other_character, slot: "head")

        patch "/play/characters/#{character.id}/equipped_items/head", params: {character_item_id: other_item.id}
        expect(response).to have_http_status(:not_found)
        expect(EquippedItem.find_by(character: character, equipped_slot: "head")).to be_nil
      end

      context "as JSON" do
        def json_response = JSON.parse(response.body)

        it "equips the item and returns the character's equipped items" do
          patch "/play/characters/#{character.id}/equipped_items/head",
            params: {character_item_id: item.id}, as: :json
          expect(response).to have_http_status(:ok)
          expect(json_response).to eq(EquippedItems::ForCharacter.call(character: character).deep_stringify_keys)
        end

        it "unequips the slot when character_item_id is blank" do
          create(:equipped_item, character: character, character_item: item, equipped_slot: "head")

          patch "/play/characters/#{character.id}/equipped_items/head",
            params: {character_item_id: ""}, as: :json
          expect(response).to have_http_status(:ok)
          expect(EquippedItem.find_by(character: character, equipped_slot: "head")).to be_nil
        end

        it "rejects an incompatible slot with a 422 and error message" do
          chest_item = create(:character_item, character: character, slot: "chest")
          patch "/play/characters/#{character.id}/equipped_items/legs",
            params: {character_item_id: chest_item.id}, as: :json
          expect(response).to have_http_status(:unprocessable_content)
          expect(json_response["error"]).to be_present
        end
      end
    end
  end
end
