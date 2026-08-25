require "rails_helper"

RSpec.describe "POST /internal_api/character_items", type: :request do
  let(:character) { create(:character) }
  let(:zone) { create(:zone) }
  let(:valid_token) { "test-token" }

  let(:valid_body) do
    {
      zone: {database_id: zone.id.to_s, identifier: zone.identifier, version: zone.version},
      identifier: "sword-of-doom",
      name: "Sword of Doom",
      slot: "main_hand",
      elvl: 584,
      primary: nil,
      secondaries: []
    }
  end

  before do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("INTERNAL_API_TOKENS", "").and_return(valid_token)
  end

  def post_item(body: valid_body, token: valid_token)
    headers = token ? {"X-Internal-Token" => token} : {}
    post "/internal_api/characters/#{character.id}/character_items", params: body.to_json,
      headers: headers.merge("Content-Type" => "application/json")
  end

  context "with a valid request" do
    it "returns 201 and the item id" do
      post_item
      expect(response).to have_http_status(:created)
      expect(response.parsed_body["id"]).to eq(CharacterItem.last.id)
    end

    it "creates a CharacterItem record" do
      expect { post_item }.to change(CharacterItem, :count).by(1)
      item = CharacterItem.last
      expect(item.character).to eq(character)
      expect(item.provenance_zone).to eq(zone)
      expect(item.source_key).to eq("#{zone.identifier}/#{zone.version}/sword-of-doom")
      expect(item.name).to eq("Sword of Doom")
      expect(item.slot).to eq("main_hand")
      expect(item.elvl).to eq(584)
    end

    it "persists primary and secondaries" do
      post_item(body: valid_body.merge(primary: "strength", secondaries: ["crit_rating"]))
      item = CharacterItem.last
      expect(item.primary_stat).to eq("strength")
      expect(item.secondary_stats).to eq(["crit_rating"])
    end
  end

  context "with a duplicate source_key" do
    before { post_item }

    it "returns 409" do
      post_item
      expect(response).to have_http_status(:conflict)
    end

    it "returns already_owned_this_version status" do
      post_item
      expect(response.parsed_body["status"]).to eq("already_owned_this_version")
    end

    it "does not create a second record" do
      expect { post_item }.not_to change(CharacterItem, :count)
    end
  end

  context "when the character owns the same item from a different version of this zone" do
    let(:other_zone) { create(:zone, identifier: zone.identifier, version: "0.0") }

    before do
      create(:character_item, character: character, provenance_zone: other_zone,
        identifier: "sword-of-doom", source_key: "#{other_zone.identifier}/0.0/sword-of-doom")
    end

    it "returns 201" do
      post_item
      expect(response).to have_http_status(:created)
    end

    it "returns already_owned_other_version status with the new item id" do
      post_item
      expect(response.parsed_body["status"]).to eq("already_owned_other_version")
      expect(response.parsed_body["id"]).to eq(CharacterItem.last.id)
    end

    it "creates a new record for this version" do
      expect { post_item }.to change(CharacterItem, :count).by(1)
    end
  end

  context "with a bad token" do
    it "returns 401" do
      post_item(token: "wrong")
      expect(response).to have_http_status(:unauthorized)
    end
  end

  context "when the character does not exist" do
    it "returns 404" do
      headers = {"X-Internal-Token" => valid_token, "Content-Type" => "application/json"}
      post "/internal_api/characters/99999/character_items", params: valid_body.to_json, headers: headers
      expect(response).to have_http_status(:not_found)
    end
  end

  context "when the zone does not exist" do
    it "returns 404" do
      post_item(body: valid_body.deep_merge(zone: {database_id: "99999"}))
      expect(response).to have_http_status(:not_found)
    end
  end

  context "when zone identifier does not match" do
    it "returns 422 with an error message" do
      post_item(body: valid_body.deep_merge(zone: {identifier: "wrong_zone"}))
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["error"]).to include("wrong_zone")
    end
  end

  context "when zone version does not match" do
    it "returns 422 with an error message" do
      post_item(body: valid_body.deep_merge(zone: {version: "9.9"}))
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["error"]).to include("9.9")
    end
  end

  context "with an invalid slot" do
    it "returns 422" do
      post_item(body: valid_body.merge(slot: "not_a_slot"))
      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  context "with a missing required field" do
    %w[identifier name slot elvl].each do |field|
      it "returns 422 when #{field} is absent" do
        post_item(body: valid_body.except(field.to_sym))
        expect(response).to have_http_status(:unprocessable_content)
      end
    end
  end
end
