require "rails_helper"

RSpec.describe "GET /internal_api/characters/:character_id/equipped_items", type: :request do
  let(:character) { create(:character) }
  let(:valid_token) { "test-token" }

  before do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("INTERNAL_API_TOKENS", "").and_return(valid_token)
  end

  def get_equipped_items(token: valid_token)
    headers = token ? {"X-Internal-Token" => token} : {}
    get "/internal_api/characters/#{character.id}/equipped_items", headers: headers
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

    it "returns each equipped item's slot and provenance" do
      item = create(:character_item, character: character, slot: "head",
        identifier: "helm-of-doom", source_key: "zone_a/1.0/helm-of-doom",
        zone_identifier: "zone_a", version: "1.0", ilvl: 584)
      create(:equipped_item, character: character, character_item: item, equipped_slot: "head")

      get_equipped_items
      expect(response.parsed_body).to eq({
        "head" => {
          "identifier" => "helm-of-doom",
          "source_key" => "zone_a/1.0/helm-of-doom",
          "zone_identifier" => "zone_a",
          "version" => "1.0",
          "ilvl" => 584
        }
      })
    end

    it "includes every equipped slot" do
      head_item = create(:character_item, character: character, slot: "head")
      chest_item = create(:character_item, character: character, slot: "chest")
      create(:equipped_item, character: character, character_item: head_item, equipped_slot: "head")
      create(:equipped_item, character: character, character_item: chest_item, equipped_slot: "chest")

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

  context "when the character does not exist" do
    it "returns 404" do
      get "/internal_api/characters/99999/equipped_items", headers: {"X-Internal-Token" => valid_token}
      expect(response).to have_http_status(:not_found)
    end
  end
end
