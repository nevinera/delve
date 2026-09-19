require "rails_helper"

RSpec.describe "Build::DpsSims", type: :request do
  let(:user) { create(:user) }
  let(:json_headers) { {"Content-Type" => "application/json"} }
  let(:game_server_url) { "http://localhost:8090/dps-sim" }

  let(:unit_type) do
    {
      name: "Goblin Raider", tokenImageUrl: ["../assets/tokens/goblin.webp"], tokenRadius: 1.5,
      maxHP: 20, dps: 4.0, attackSpeed: 1.0,
      resource: {name: "energy", color: "888888", max: 100.0, defaultValue: 100.0, returnRate: 0.0, isFluid: true}
    }
  end
  let(:matrix) do
    {results: [{gearingPlan: "offense", elevation: 0, dps: 3.9, ttdSeconds: 40.0,
                basicAttackDamage: 1170.0, powerDamage: 0.0, statusTickDamage: 0.0, totalDamage: 1170.0}]}
  end

  context "when not logged in" do
    it "redirects to login" do
      post "/build/dps_sims/unit_type", params: unit_type.to_json, headers: json_headers
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    it "returns the game server's matrix for a valid unit type" do
      stub = stub_request(:post, game_server_url)
        .with { |req| JSON.parse(req.body)["enemy"]["name"] == "Goblin Raider" }
        .to_return(status: 200, body: matrix.to_json, headers: json_headers)

      post "/build/dps_sims/unit_type", params: unit_type.to_json, headers: json_headers

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["results"].first["dps"]).to eq(3.9)
      expect(stub).to have_been_requested
    end

    it "returns 422 with the validation error and skips the game server for an invalid unit type" do
      post "/build/dps_sims/unit_type", params: unit_type.merge(tokenRadius: 0.5).to_json, headers: json_headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["path"]).to eq("$.tokenRadius")
      expect(WebMock).not_to have_requested(:post, game_server_url)
    end

    it "returns 400 for a malformed JSON body" do
      post "/build/dps_sims/unit_type", params: "not json", headers: json_headers

      expect(response).to have_http_status(:bad_request)
    end

    it "returns 502 when the game server returns an error" do
      stub_request(:post, game_server_url).to_return(status: 401, body: '{"error":"unauthorized"}', headers: json_headers)

      post "/build/dps_sims/unit_type", params: unit_type.to_json, headers: json_headers

      expect(response).to have_http_status(:bad_gateway)
    end

    it "returns 502 when the game server is unreachable" do
      stub_request(:post, game_server_url).to_raise(Errno::ECONNREFUSED)

      post "/build/dps_sims/unit_type", params: unit_type.to_json, headers: json_headers

      expect(response).to have_http_status(:bad_gateway)
    end
  end
end
