require "rails_helper"

RSpec.describe "GET /internal_api/world_characters/:world_character_id/equipped_items", type: :request do
  let(:world_character) { create(:world_character) }
  let(:valid_token) { "test-token" }

  before do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("INTERNAL_API_TOKENS", "").and_return(valid_token)
  end

  def get_equipped_items(token: valid_token)
    headers = token ? {"X-Internal-Token" => token} : {}
    get "/internal_api/world_characters/#{world_character.id}/equipped_items", headers: headers
  end

  context "with a valid request" do
    it "returns 200" do
      get_equipped_items
      expect(response).to have_http_status(:ok)
    end

    it "returns an empty object when nothing is equipped" do
      get_equipped_items
      expect(response.parsed_body).to eq({})
    end

    it "returns each equipped item's slot, provenance, and stats" do
      item = create(:character_item, world_character:, slot: "head",
        identifier: "helm-of-doom",
        version: "1.0", elvl: 584, primary_stat: "strength")
      create(:equipped_item, world_character:, character_item: item, equipped_slot: "head")

      get_equipped_items
      head = response.parsed_body["head"]
      expect(head).to include(
        "identifier" => "helm-of-doom",
        "id" => item.id,
        "world_version_id" => nil,
        "version" => "1.0",
        "slot" => "head",
        "elvl" => 584,
        "shield" => false,
        "primary_stat" => "strength"
      )
      expect(head["stats"]["strength"]).to be > 0
    end

    it "includes every equipped slot" do
      head_item = create(:character_item, world_character:, slot: "head")
      chest_item = create(:character_item, world_character:, slot: "chest")
      create(:equipped_item, world_character:, character_item: head_item, equipped_slot: "head")
      create(:equipped_item, world_character:, character_item: chest_item, equipped_slot: "chest")

      get_equipped_items
      expect(response.parsed_body.keys).to contain_exactly("head", "chest")
    end
  end

  context "with a bad token" do
    it "returns 401" do
      get_equipped_items(token: "wrong")
      expect(response).to have_http_status(:unauthorized)
    end
  end

  context "when the world character does not exist" do
    it "returns 404" do
      get "/internal_api/world_characters/99999/equipped_items", headers: {"X-Internal-Token" => valid_token}
      expect(response).to have_http_status(:not_found)
    end
  end
end
