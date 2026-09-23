require "rails_helper"

RSpec.describe GameApi::ClassDpsSimClient do
  let(:base_url) { "http://game-test.local" }
  let(:token) { "test-token-abc" }
  let(:client) { described_class.new(base_url: base_url, auth_tokens: token) }

  let(:json_headers) { {"Content-Type" => "application/json"} }

  let(:character_class) do
    {
      "name" => "Puncher",
      "primaryStats" => ["strength"],
      "secondaryStats" => ["crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "stamina"],
      "wields" => ["dagger", "dagger"]
    }
  end
  let(:strategy) { [{power: "Bolt"}] }
  let(:valid_attrs) { {class: character_class, strategy: strategy} }

  let(:result_body) do
    {
      results: [
        {durationSeconds: 60.0, elevation: -20, elevationLabel: "trainee",
         dps: 6.5, basicAttackDamage: 300.0, powerDamage: 90.0, statusTickDamage: 0.0, totalDamage: 390.0},
        {durationSeconds: 60.0, elevation: -10, elevationLabel: "dungeon",
         dps: 8.0, basicAttackDamage: 350.0, powerDamage: 130.0, statusTickDamage: 0.0, totalDamage: 480.0}
      ]
    }.to_json
  end

  describe "#simulate" do
    it "POSTs to /class-dps-sim and returns the duration x elevation matrix" do
      stub_request(:post, "#{base_url}/class-dps-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      result = client.simulate(valid_attrs)
      expect(result["results"].length).to eq(2)
      expect(result["results"].first["elevationLabel"]).to eq("trainee")
      expect(result["results"].first["dps"]).to eq(6.5)
    end

    it "sends class and strategy in the request body" do
      stub_request(:post, "#{base_url}/class-dps-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      client.simulate(valid_attrs)
      expect(WebMock).to have_requested(:post, "#{base_url}/class-dps-sim")
        .with { |req|
          body = JSON.parse(req.body)
          body["class"] == character_class && body["strategy"] == JSON.parse(strategy.to_json)
        }
    end

    it "sends the Bearer token" do
      stub_request(:post, "#{base_url}/class-dps-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      client.simulate(valid_attrs)
      expect(WebMock).to have_requested(:post, "#{base_url}/class-dps-sim")
        .with(headers: {"Authorization" => "Bearer #{token}"})
    end

    it "accepts an omitted strategy" do
      stub_request(:post, "#{base_url}/class-dps-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      expect { client.simulate(class: character_class) }.not_to raise_error
    end

    it "raises UnprocessableError when the game server rejects the request" do
      stub_request(:post, "#{base_url}/class-dps-sim")
        .to_return(status: 422, body: '{"error":"invalid request body"}', headers: json_headers)

      expect { client.simulate(valid_attrs) }
        .to raise_error(GameApi::UnprocessableError, /invalid request body/)
    end

    context "attr validation" do
      it "raises InvalidAttrsError when class is missing" do
        expect { client.simulate({}) }
          .to raise_error(GameApi::InvalidAttrsError, /missing required keys: class/)
      end

      it "raises InvalidAttrsError for unsupported keys" do
        expect { client.simulate(valid_attrs.merge(bogus: "nope")) }
          .to raise_error(GameApi::InvalidAttrsError, /unsupported keys:.*bogus/)
      end
    end
  end
end
