require "rails_helper"

RSpec.describe "Play::CharacterSettings", type: :request do
  let(:user) { create(:user) }
  let!(:character) { create(:character, user: user) }
  let(:path) { "/play/characters/#{character.id}/setting" }
  let(:json_headers) { {"Content-Type" => "application/json"} }

  context "when not logged in" do
    it "redirects to login" do
      get path
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    it "returns defaults without persisting when none are saved" do
      get path

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq(
        "cameraSensitivity" => 1.0, "abilityButtonMap" => {}, "customHotkeys" => {}
      )
      expect(CharacterSetting.count).to eq(0)
    end

    it "creates the row on first update and returns the saved values" do
      body = {setting: {camera_sensitivity: 2.5, ability_button_map: {"0" => 3}, custom_hotkeys: {"ability_9" => "s+2"}}}

      patch path, params: body.to_json, headers: json_headers

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq(
        "cameraSensitivity" => 2.5, "abilityButtonMap" => {"0" => 3}, "customHotkeys" => {"ability_9" => "s+2"}
      )
      expect(character.reload.character_setting.custom_hotkeys).to eq({"ability_9" => "s+2"})
    end

    it "leaves unspecified settings alone on a partial update" do
      create(:character_setting, character: character, custom_hotkeys: {"toggle_latency" => "k"})

      patch path, params: {setting: {camera_sensitivity: 0.5}}.to_json, headers: json_headers

      expect(response).to have_http_status(:ok)
      expect(character.reload.character_setting.custom_hotkeys).to eq({"toggle_latency" => "k"})
      expect(character.character_setting.camera_sensitivity).to eq(0.5)
    end

    it "returns 422 with errors for invalid values" do
      patch path, params: {setting: {ability_button_map: {"a" => "b"}}}.to_json, headers: json_headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["errors"]).to have_key("ability_button_map")
    end

    it "returns 422 for an unknown hotkey action" do
      patch path, params: {setting: {custom_hotkeys: {"fly" => "f"}}}.to_json, headers: json_headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["errors"]).to have_key("custom_hotkeys")
    end

    it "404s for another user's character" do
      other = create(:character)

      get "/play/characters/#{other.id}/setting"

      expect(response).to have_http_status(:not_found)
    end
  end
end
