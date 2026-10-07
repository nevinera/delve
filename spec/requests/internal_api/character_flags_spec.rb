require "rails_helper"

RSpec.describe "InternalApi::CharacterFlags", type: :request do
  let(:version) { create(:world_version) }
  let(:world_character) { create(:world_character, world: version.world, world_version: version) }
  let(:headers) { {"X-Internal-Token" => "test-token"} }

  before do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("INTERNAL_API_TOKENS", "").and_return("test-token")
  end

  def base = "/internal_api/world_characters/#{world_character.id}/flags"

  describe "GET show" do
    it "says whether the world character holds the flag" do
      create(:character_flag, world_character:, flag_type: "zone", identifier: "reached/darkwood")
      get("#{base}/zone/reached/darkwood", headers:)
      expect(response.parsed_body).to eq("held" => true)
      get("#{base}/zone/reached/cave", headers:)
      expect(response.parsed_body).to eq("held" => false)
    end

    it "keeps dots in the flag rather than reading a format" do
      get("#{base}/key/a.json", headers:)
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "refuses an invalid flag" do
      get("#{base}/bogus/thing", headers:)
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "needs the internal token" do
      get "#{base}/key/gate"
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns 404 for an unknown world character" do
      get("/internal_api/world_characters/0/flags/key/gate", headers:)
      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST create" do
    it "grants the flag under the world character's version" do
      post base, params: {flag: "zone/reached/darkwood"}, headers:, as: :json
      expect(response).to have_http_status(:created)
      expect(world_character.character_flags.sole).to have_attributes(flag_type: "zone", identifier: "reached/darkwood", world_version: version)
    end

    it "succeeds without a second row when already granted" do
      2.times { post base, params: {flag: "key/gate"}, headers:, as: :json }
      expect(response).to have_http_status(:created)
      expect(world_character.character_flags.count).to eq(1)
    end

    it "refuses an invalid flag" do
      post base, params: {flag: "key/no spaces"}, headers:, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(CharacterFlag.count).to eq(0)
    end
  end
end
