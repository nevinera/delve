require "rails_helper"

RSpec.describe GameApi::BaseClient do
  let(:base_url) { "http://game-test.local" }
  let(:token) { "test-token-abc" }
  let(:client) { described_class.new(base_url: base_url, auth_tokens: token) }

  let(:json_headers) { {"Content-Type" => "application/json"} }

  # --- status ---

  describe "#status" do
    it "returns parsed response" do
      stub_request(:get, "#{base_url}/status.json")
        .to_return(status: 200, body: '{"status":"ok","instance_count":0,"version":"0.1.0"}', headers: json_headers)

      result = client.status
      expect(result["status"]).to eq("ok")
      expect(result["instance_count"]).to eq(0)
    end

    it "works without a token configured" do
      c = described_class.new(base_url: base_url, auth_tokens: "")
      stub_request(:get, "#{base_url}/status.json")
        .to_return(status: 200, body: '{"status":"ok","instance_count":0,"version":"0.1.0"}', headers: json_headers)

      expect { c.status }.not_to raise_error
    end

    it "sends no Authorization header when auth_tokens is empty" do
      c = described_class.new(base_url: base_url, auth_tokens: "")
      stub_request(:get, "#{base_url}/status.json")
        .to_return(status: 200, body: '{"status":"ok","instance_count":0,"version":"0.1.0"}', headers: json_headers)

      c.status
      expect(WebMock).not_to have_requested(:get, "#{base_url}/status.json")
        .with(headers: {"Authorization" => anything})
    end
  end

  # --- token selection ---

  describe "token selection from comma-separated list" do
    it "uses the first token" do
      c = described_class.new(base_url: base_url, auth_tokens: "first,second,third")
      stub_request(:get, "#{base_url}/status.json")
        .to_return(status: 200, body: '{"status":"ok","instance_count":0,"version":"0.1.0"}', headers: json_headers)

      c.status
      expect(WebMock).to have_requested(:get, "#{base_url}/status.json")
        .with(headers: {"Authorization" => "Bearer first"})
    end
  end

  # --- error classes ---

  describe "error mapping" do
    it "raises AuthError on 401" do
      stub_request(:get, "#{base_url}/status.json")
        .to_return(status: 401, body: '{"error":"authorization required"}', headers: json_headers)

      expect { client.status }.to raise_error(GameApi::AuthError) do |e|
        expect(e.status).to eq(401)
        expect(e.message).to eq("authorization required")
      end
    end

    it "raises ServiceUnavailableError on 503" do
      stub_request(:get, "#{base_url}/status.json")
        .to_return(status: 503, body: '{"error":"server is at maximum instance capacity"}', headers: json_headers)

      expect { client.status }.to raise_error(GameApi::ServiceUnavailableError) do |e|
        expect(e.status).to eq(503)
        expect(e.message).to include("maximum instance capacity")
      end
    end

    it "raises Error on 500" do
      stub_request(:get, "#{base_url}/status.json")
        .to_return(status: 500, body: '{"error":"internal error"}', headers: json_headers)

      expect { client.status }.to raise_error(GameApi::Error) do |e|
        expect(e.status).to eq(500)
      end
    end
  end
end
