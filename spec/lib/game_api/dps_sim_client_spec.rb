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
  let(:target) { {strength: 50.0, agility: 10.0, intellect: 0.0, defenceRating: 20.0, maxHealth: 200.0} }
  let(:valid_attrs) { {enemy: enemy, target: target} }

  let(:result_body) do
    {
      durationSeconds: 300.0, dps: 6.98, ttdSeconds: 28.65,
      basicAttackDamage: 2094.0, powerDamage: 0.0, statusTickDamage: 0.0, totalDamage: 2094.0
    }.to_json
  end

  describe "#simulate" do
    it "POSTs to /dps-sim and returns the DPS result" do
      stub_request(:post, "#{base_url}/dps-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      result = client.simulate(valid_attrs)
      expect(result["dps"]).to eq(6.98)
      expect(result["ttdSeconds"]).to eq(28.65)
      expect(result["basicAttackDamage"]).to eq(2094.0)
    end

    it "sends enemy and target in the request body" do
      stub_request(:post, "#{base_url}/dps-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      client.simulate(valid_attrs)
      expect(WebMock).to have_requested(:post, "#{base_url}/dps-sim")
        .with { |req|
          body = JSON.parse(req.body)
          body["enemy"] == enemy && body["target"] == JSON.parse(target.to_json)
        }
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

    it "returns a nil ttdSeconds when the response has none" do
      stub_request(:post, "#{base_url}/dps-sim")
        .to_return(status: 200, body: {durationSeconds: 10.0, dps: 0.0, ttdSeconds: nil,
                                       basicAttackDamage: 0.0, powerDamage: 0.0,
                                       statusTickDamage: 0.0, totalDamage: 0.0}.to_json, headers: json_headers)

      result = client.simulate(valid_attrs)
      expect(result["ttdSeconds"]).to be_nil
    end

    it "raises UnprocessableError when durationSeconds is out of bounds" do
      stub_request(:post, "#{base_url}/dps-sim")
        .to_return(status: 422, body: '{"error":"durationSeconds must be > 0 and <= 3600"}', headers: json_headers)

      expect { client.simulate(valid_attrs.merge(durationSeconds: 9999.0)) }
        .to raise_error(GameApi::UnprocessableError, /durationSeconds/)
    end

    context "attr validation" do
      it "raises InvalidAttrsError when enemy is missing" do
        expect { client.simulate(target: target) }
          .to raise_error(GameApi::InvalidAttrsError, /missing required keys: enemy/)
      end

      it "raises InvalidAttrsError when target is missing" do
        expect { client.simulate(enemy: enemy) }
          .to raise_error(GameApi::InvalidAttrsError, /missing required keys: target/)
      end

      it "raises InvalidAttrsError for unsupported keys" do
        expect { client.simulate(valid_attrs.merge(bogus: "nope")) }
          .to raise_error(GameApi::InvalidAttrsError, /unsupported keys: bogus/)
      end
    end
  end
end
