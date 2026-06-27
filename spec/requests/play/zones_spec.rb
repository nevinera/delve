require "rails_helper"

RSpec.describe "Play::Zones", type: :request do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:character_class) { create(:character_class, state: :fetched) }
  let!(:character) { create(:character, user: user, character_class: character_class) }
  let!(:zone) { create(:zone, state: :fetched) }

  let(:join_result) do
    JoinZone::Result.new(
      token: "tok_abc123",
      instance_identifier: "inst-uuid",
      slot_id: "slot-uuid"
    )
  end

  context "when not logged in" do
    it "redirects to login" do
      get "/play/characters/#{character.id}/zones/#{zone.id}"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    context "with a character belonging to the current user" do
      before { allow(JoinZone).to receive(:call).and_return(join_result) }

      it "returns 200" do
        get "/play/characters/#{character.id}/zones/#{zone.id}"
        expect(response).to have_http_status(:ok)
      end

      it "renders the game client layout (no nav)" do
        get "/play/characters/#{character.id}/zones/#{zone.id}"
        expect(response.body).not_to include("<nav>")
      end

      it "exposes slot token as a data attribute" do
        get "/play/characters/#{character.id}/zones/#{zone.id}"
        expect(response.body).to include('data-slot-token="tok_abc123"')
      end

      it "exposes instance and slot IDs as data attributes" do
        get "/play/characters/#{character.id}/zones/#{zone.id}"
        expect(response.body).to include('data-instance-id="inst-uuid"')
        expect(response.body).to include('data-slot-id="slot-uuid"')
      end

      it "calls JoinZone with the correct character and zone" do
        get "/play/characters/#{character.id}/zones/#{zone.id}"
        expect(JoinZone).to have_received(:call).with(character: character, zone: zone)
      end
    end

    context "with a character belonging to another user" do
      let!(:other_character) { create(:character, user: other_user, character_class: character_class) }

      it "returns 404" do
        get "/play/characters/#{other_character.id}/zones/#{zone.id}"
        expect(response).to have_http_status(:not_found)
      end
    end
  end
end
