require "rails_helper"

RSpec.describe GameApi::DpsSimClient do
  let(:base_url) { "http://game-test.local" }
  let(:token) { "test-token-abc" }
  let(:client) { described_class.new(base_url: base_url, auth_tokens: token) }

  let(:json_headers) { {"Content-Type" => "application/json"} }

  let(:enemy) do
    {
      "name" => "Cave Goblin",
      "tokenRadius" => 2.0,
      "maxHP" => 100,
      "dps" => 10.0,
      "attackSpeed" => 1.0,
      "resource" => {"name" => "none", "max" => 0, "defaultValue" => 0, "isFluid" => false}
    }
  end
  let(:valid_attrs) { {enemy: enemy} }

  let(:result_body) do
    {
      results: [
        {gearingPlan: "offense", elevation: 0, dps: 9.5, ttdSeconds: 21.0,
         basicAttackDamage: 2850.0, powerDamage: 0.0, statusTickDamage: 0.0, totalDamage: 2850.0},
        {gearingPlan: "defense", elevation: 0, dps: 4.2, ttdSeconds: nil,
         basicAttackDamage: 1260.0, powerDamage: 0.0, statusTickDamage: 0.0, totalDamage: 1260.0}
      ]
    }.to_json
  end

  describe "#simulate" do
    it "POSTs to /dps-sim and returns the gearing-plan x elevation matrix" do
      stub_request(:post, "#{base_url}/dps-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      result = client.simulate(valid_attrs)
      expect(result["results"].length).to eq(2)
      expect(result["results"].first["gearingPlan"]).to eq("offense")
      expect(result["results"].first["dps"]).to eq(9.5)
    end

    it "returns a nil ttdSeconds for a cell that took no damage" do
      stub_request(:post, "#{base_url}/dps-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      result = client.simulate(valid_attrs)
      expect(result["results"].last["ttdSeconds"]).to be_nil
    end

    it "sends enemy in the request body" do
      stub_request(:post, "#{base_url}/dps-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      client.simulate(valid_attrs)
      expect(WebMock).to have_requested(:post, "#{base_url}/dps-sim")
        .with { |req| JSON.parse(req.body)["enemy"] == enemy }
    end

    it "does not send a target - the server mocks up its own gearing plans" do
      stub_request(:post, "#{base_url}/dps-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      client.simulate(valid_attrs)
      expect(WebMock).to have_requested(:post, "#{base_url}/dps-sim")
        .with { |req| !JSON.parse(req.body).key?("target") }
    end

    it "sends the Bearer token" do
      stub_request(:post, "#{base_url}/dps-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      client.simulate(valid_attrs)
      expect(WebMock).to have_requested(:post, "#{base_url}/dps-sim")
        .with(headers: {"Authorization" => "Bearer #{token}"})
    end

    it "accepts optional durationSeconds and seed" do
      stub_request(:post, "#{base_url}/dps-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      expect {
        client.simulate(valid_attrs.merge(durationSeconds: 60.0, seed: 42))
      }.not_to raise_error
    end

    it "raises UnprocessableError when durationSeconds is out of bounds" do
      stub_request(:post, "#{base_url}/dps-sim")
        .to_return(status: 422, body: '{"error":"durationSeconds must be > 0 and <= 3600"}', headers: json_headers)

      expect { client.simulate(valid_attrs.merge(durationSeconds: 9999.0)) }
        .to raise_error(GameApi::UnprocessableError, /durationSeconds/)
    end

    context "attr validation" do
      it "raises InvalidAttrsError when enemy is missing" do
        expect { client.simulate({}) }
          .to raise_error(GameApi::InvalidAttrsError, /missing required keys: enemy/)
      end

      it "raises InvalidAttrsError for unsupported keys" do
        expect { client.simulate(valid_attrs.merge(target: {}, bogus: "nope")) }
          .to raise_error(GameApi::InvalidAttrsError, /unsupported keys:.*target.*bogus|unsupported keys:.*bogus.*target/)
      end
    end
  end
end
