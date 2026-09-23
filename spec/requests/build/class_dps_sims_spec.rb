require "rails_helper"

RSpec.describe "Build::ClassDpsSims", type: :request do
  let(:user) { create(:user) }
  let(:json_headers) { {"Content-Type" => "application/json"} }
  let(:game_server_url) { "http://localhost:8090/class-dps-sim" }

  let(:character_class) do
    {
      name: "Puncher",
      colors: {major: "FF0000", minor: "00FF00"},
      resources: [{name: "energy", color: "888888", max: 100.0, defaultValue: 100.0, returnRate: 0.0, isFluid: true, displayType: "primary"}],
      primaryStats: ["strength"],
      secondaryStats: ["crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "stamina"],
      wields: ["dagger", "dagger"]
    }
  end
  let(:strategy) { [{power: "Bolt"}] }
  let(:matrix) do
    {results: [{durationSeconds: 60.0, elevation: 0, elevationLabel: "heroic",
                dps: 12.3, basicAttackDamage: 300.0, powerDamage: 438.0, statusTickDamage: 0.0, totalDamage: 738.0}]}
  end

  context "when not logged in" do
    it "redirects to login" do
      post "/build/class_dps_sims/character_class", params: {class: character_class, strategy: strategy}.to_json, headers: json_headers
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    it "returns the game server's matrix for a valid class" do
      stub = stub_request(:post, game_server_url)
        .with { |req| JSON.parse(req.body)["class"]["name"] == "Puncher" }
        .to_return(status: 200, body: matrix.to_json, headers: json_headers)

      post "/build/class_dps_sims/character_class", params: {class: character_class, strategy: strategy}.to_json, headers: json_headers

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["results"].first["dps"]).to eq(12.3)
      expect(stub).to have_been_requested
    end

    it "defaults strategy to an empty array when omitted" do
      stub = stub_request(:post, game_server_url)
        .with { |req| JSON.parse(req.body)["strategy"] == [] }
        .to_return(status: 200, body: matrix.to_json, headers: json_headers)

      post "/build/class_dps_sims/character_class", params: {class: character_class}.to_json, headers: json_headers

      expect(response).to have_http_status(:ok)
      expect(stub).to have_been_requested
    end

    it "returns 422 with the validation error and skips the game server for an invalid class" do
      post "/build/class_dps_sims/character_class", params: {class: character_class.merge(wields: [])}.to_json, headers: json_headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["path"]).to eq("$.wields")
      expect(WebMock).not_to have_requested(:post, game_server_url)
    end

    it "returns 400 for a malformed JSON body" do
      post "/build/class_dps_sims/character_class", params: "not json", headers: json_headers

      expect(response).to have_http_status(:bad_request)
    end

    it "returns 502 when the game server returns an error" do
      stub_request(:post, game_server_url).to_return(status: 401, body: '{"error":"unauthorized"}', headers: json_headers)

      post "/build/class_dps_sims/character_class", params: {class: character_class, strategy: strategy}.to_json, headers: json_headers

      expect(response).to have_http_status(:bad_gateway)
    end

    it "returns 502 when the game server is unreachable" do
      stub_request(:post, game_server_url).to_raise(Errno::ECONNREFUSED)

      post "/build/class_dps_sims/character_class", params: {class: character_class, strategy: strategy}.to_json, headers: json_headers

      expect(response).to have_http_status(:bad_gateway)
    end
  end
end
