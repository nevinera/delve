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

  describe "GET /play/characters/:character_id/zones" do
    let!(:validation_failed_zone) { create(:zone, state: :validation_failed) }

    context "when not logged in" do
      it "redirects to login" do
        get "/play/characters/#{character.id}/zones"
        expect(response).to redirect_to("/login")
      end
    end

    context "when logged in" do
      before { sign_in user }

      it "returns 200 and links to the fetched zone" do
        get "/play/characters/#{character.id}/zones"
        expect(response).to have_http_status(:ok)
        expect(response.body).to include(play_character_zone_path(character, zone))
      end

      it "does not link to a zone that hasn't fetched successfully" do
        get "/play/characters/#{character.id}/zones"
        expect(response.body).not_to include(play_character_zone_path(character, validation_failed_zone))
      end

      it "renders the normal layout (with nav)" do
        get "/play/characters/#{character.id}/zones"
        expect(response.body).to include("<nav>")
      end

      context "with a character belonging to another user" do
        let!(:other_character) { create(:character, user: other_user, character_class: character_class) }

        it "returns 404" do
          get "/play/characters/#{other_character.id}/zones"
          expect(response).to have_http_status(:not_found)
        end
      end
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

      it "exposes the character's equipped items as a data attribute" do
        item = create(:character_item, character: character, slot: "head")
        create(:equipped_item, character: character, character_item: item, equipped_slot: "head")

        get "/play/characters/#{character.id}/zones/#{zone.id}"
        expect(response.body).to include(CGI.escapeHTML(EquippedItems::ForCharacter.call(character: character).to_json))
      end

      it "exposes the character items JSON URL as a data attribute" do
        get "/play/characters/#{character.id}/zones/#{zone.id}"
        expect(response.body).to include(CGI.escapeHTML(play_character_character_items_path(character, format: :json)))
      end

      it "exposes the equipped items URL as a data attribute" do
        get "/play/characters/#{character.id}/zones/#{zone.id}"
        expect(response.body).to include(CGI.escapeHTML(play_character_equipped_items_path(character)))
      end

      it "exposes the character's settings and their URL as data attributes" do
        create(:character_setting, character: character, camera_sensitivity: 2.5, custom_hotkeys: {"L" => "ability_1"})

        get "/play/characters/#{character.id}/zones/#{zone.id}"
        expect(response.body).to include(CGI.escapeHTML(character.reload.character_setting.as_client_json.to_json))
        expect(response.body).to include(CGI.escapeHTML(play_character_setting_path(character)))
      end

      it "exposes default settings when none are saved" do
        get "/play/characters/#{character.id}/zones/#{zone.id}"
        expect(response.body).to include(CGI.escapeHTML(CharacterSetting.new.as_client_json.to_json))
      end

      it "exposes the stock asset list as a data attribute" do
        get "/play/characters/#{character.id}/zones/#{zone.id}"
        expect(response.body).to include(CGI.escapeHTML({"duration" => 0.12, "url" => "/abilities/sounds/twang.ogg"}.to_json))
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
