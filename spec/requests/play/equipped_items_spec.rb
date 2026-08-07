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
    end

    context "with a character belonging to another user" do
      let!(:other_character) { create(:character, user: other_user) }

      it "returns 404" do
        get "/play/characters/#{other_character.id}/equipped_items"
        expect(response).to have_http_status(:not_found)
      end
    end
  end
end
