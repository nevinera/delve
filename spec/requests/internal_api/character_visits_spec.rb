require "rails_helper"

RSpec.describe "InternalApi::CharacterVisits", type: :request do
  let(:version) { create(:world_version) }
  let(:world_character) { create(:world_character, world: version.world, world_version: version) }
  let(:headers) { {"X-Internal-Token" => "test-token"} }

  before do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("INTERNAL_API_TOKENS", "").and_return("test-token")
  end

  def base = "/internal_api/world_characters/#{world_character.id}/visits"

  describe "POST create" do
    it "records the visit" do
      post base, params: {zone: "darkwood", map: "glade", place: "pond"}, headers:, as: :json
      expect(response).to have_http_status(:created)
      expect(response.parsed_body).to eq("zone" => "darkwood", "map" => "glade", "place" => "pond")
      expect(world_character.character_visits.sole)
        .to have_attributes(zone_identifier: "darkwood", map_identifier: "glade", place_identifier: "pond", world_version: version)
    end

    it "records a zone visit with no map or place" do
      post base, params: {zone: "darkwood"}, headers:, as: :json
      expect(response).to have_http_status(:created)
      expect(world_character.character_visits.sole).to have_attributes(map_identifier: "", place_identifier: "")
    end

    it "succeeds without a second row when already recorded" do
      2.times { post base, params: {zone: "darkwood", map: "glade"}, headers:, as: :json }
      expect(response).to have_http_status(:created)
      expect(world_character.character_visits.count).to eq(1)
    end

    it "refuses a place without a map" do
      post base, params: {zone: "darkwood", place: "pond"}, headers:, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["error"]).to match(/needs a map/)
    end

    it "needs the internal token" do
      post base, params: {zone: "darkwood"}, as: :json
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns 404 for an unknown world character" do
      post("/internal_api/world_characters/0/visits", params: {zone: "darkwood"}, headers:, as: :json)
      expect(response).to have_http_status(:not_found)
    end
  end
end
