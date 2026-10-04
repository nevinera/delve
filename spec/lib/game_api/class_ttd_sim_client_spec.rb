require "rails_helper"

RSpec.describe GameApi::ClassTtdSimClient do
  let(:base_url) { "http://game-test.local" }
  let(:token) { "test-token-abc" }
  let(:client) { described_class.new(base_url: base_url, auth_tokens: token) }

  let(:json_headers) { {"Content-Type" => "application/json"} }

  let(:character_class) do
    {
      "name" => "Puncher",
      "primaryStats" => ["strength"],
      "statPriorities" => [{"name" => "hybrid", "secondaryStats" => ["crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "stamina"]}],
      "wields" => ["dagger", "dagger"]
    }
  end
  let(:strategy) { [{power: "Bolt"}] }
  let(:valid_attrs) { {class: character_class, strategy: strategy} }

  let(:result_body) do
    {
      results: [
        {priority: "hybrid", intendedFor: "open", pull: "solo", school: "physical", elevation: 0,
         hpLostPct: 20.0, fightSeconds: 12.0, cleared: true, died: false, ttd: 40.0, survives: false, capSeconds: 300.0}
      ]
    }.to_json
  end

  describe "#simulate" do
    it "POSTs to /class-ttd-sim and returns the survivability cells" do
      stub_request(:post, "#{base_url}/class-ttd-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      result = client.simulate(valid_attrs)
      expect(result["results"].length).to eq(1)
      expect(result["results"].first["ttd"]).to eq(40.0)
    end

    it "sends class and strategy in the request body" do
      stub_request(:post, "#{base_url}/class-ttd-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      client.simulate(valid_attrs)
      expect(WebMock).to have_requested(:post, "#{base_url}/class-ttd-sim")
        .with { |req|
          body = JSON.parse(req.body)
          body["class"] == character_class && body["strategy"] == JSON.parse(strategy.to_json)
        }
    end

    it "sends the Bearer token" do
      stub_request(:post, "#{base_url}/class-ttd-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      client.simulate(valid_attrs)
      expect(WebMock).to have_requested(:post, "#{base_url}/class-ttd-sim")
        .with(headers: {"Authorization" => "Bearer #{token}"})
    end

    it "accepts extended" do
      stub_request(:post, "#{base_url}/class-ttd-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      expect { client.simulate(valid_attrs.merge(extended: true)) }.not_to raise_error
    end

    it "accepts an omitted strategy" do
      stub_request(:post, "#{base_url}/class-ttd-sim")
        .to_return(status: 200, body: result_body, headers: json_headers)

      expect { client.simulate(class: character_class) }.not_to raise_error
    end

    it "raises UnprocessableError when the game server rejects the request" do
      stub_request(:post, "#{base_url}/class-ttd-sim")
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
