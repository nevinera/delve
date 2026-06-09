require "rails_helper"

RSpec.describe GameApi::Client do
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
  end

  # --- list_instances ---

  describe "#list_instances" do
    it "returns the instances list" do
      stub_request(:get, "#{base_url}/instances")
        .to_return(status: 200, body: '{"instances":[]}', headers: json_headers)

      result = client.list_instances
      expect(result["instances"]).to eq([])
    end

    it "sends the Bearer token" do
      stub_request(:get, "#{base_url}/instances")
        .to_return(status: 200, body: '{"instances":[]}', headers: json_headers)

      client.list_instances
      expect(WebMock).to have_requested(:get, "#{base_url}/instances")
        .with(headers: {"Authorization" => "Bearer #{token}"})
    end

    it "raises AuthError on 401" do
      stub_request(:get, "#{base_url}/instances")
        .to_return(status: 401, body: '{"error":"authorization required"}', headers: json_headers)

      expect { client.list_instances }.to raise_error(GameApi::AuthError) do |e|
        expect(e.status).to eq(401)
        expect(e.message).to eq("authorization required")
      end
    end

    it "raises Error on 500" do
      stub_request(:get, "#{base_url}/instances")
        .to_return(status: 500, body: '{"error":"server is not configured for authenticated access"}', headers: json_headers)

      expect { client.list_instances }.to raise_error(GameApi::Error) do |e|
        expect(e.status).to eq(500)
      end
    end
  end

  # --- show_instance ---

  describe "#show_instance" do
    let(:instance_id) { "550e8400-e29b-41d4-a716-446655440000" }
    let(:instance_body) do
      {identifier: instance_id, database_id: "db-1", status: "loading"}.to_json
    end

    it "returns the instance" do
      stub_request(:get, "#{base_url}/instances/#{instance_id}")
        .to_return(status: 200, body: instance_body, headers: json_headers)

      result = client.show_instance(instance_id)
      expect(result["identifier"]).to eq(instance_id)
    end

    it "raises NotFoundError on 404" do
      stub_request(:get, "#{base_url}/instances/#{instance_id}")
        .to_return(status: 404, body: '{"error":"instance not found"}', headers: json_headers)

      expect { client.show_instance(instance_id) }
        .to raise_error(GameApi::NotFoundError) do |e|
          expect(e.status).to eq(404)
        end
    end
  end

  # --- create_instance ---

  describe "#create_instance" do
    let(:instance_id) { "550e8400-e29b-41d4-a716-446655440001" }
    let(:zone_config) { {"name" => "Test Zone", "private" => false, "maps" => []} }
    let(:created_body) do
      {identifier: instance_id, status: "loading", max_slots: 25}.to_json
    end

    def call_create
      client.create_instance(
        identifier: instance_id,
        database_id: "db-42",
        zone_identifier: "test-zone",
        version: "1.0",
        source_url: "https://example.com/zone.json",
        zone_config: zone_config
      )
    end

    # create_instance takes a plain hash, so keyword and hash forms are equivalent

    it "POSTs to /instances and returns the created instance" do
      stub_request(:post, "#{base_url}/instances")
        .to_return(status: 201, body: created_body, headers: json_headers)

      result = call_create
      expect(result["identifier"]).to eq(instance_id)
      expect(result["status"]).to eq("loading")
    end

    it "sends the zone_config in the request body" do
      stub_request(:post, "#{base_url}/instances")
        .to_return(status: 201, body: created_body, headers: json_headers)

      call_create
      expect(WebMock).to have_requested(:post, "#{base_url}/instances")
        .with { |req|
          body = JSON.parse(req.body)
          body["zone_config"] == zone_config && body["identifier"] == instance_id
        }
    end

    it "raises UnprocessableError on 422" do
      stub_request(:post, "#{base_url}/instances")
        .to_return(status: 422, body: '{"error":"invalid identifier: must be a valid UUID"}', headers: json_headers)

      expect { call_create }.to raise_error(GameApi::UnprocessableError) do |e|
        expect(e.status).to eq(422)
        expect(e.message).to include("UUID")
      end
    end
  end

  # --- destroy_instance ---

  describe "#destroy_instance" do
    let(:instance_id) { "550e8400-e29b-41d4-a716-446655440002" }

    it "returns nil on success" do
      stub_request(:delete, "#{base_url}/instances/#{instance_id}")
        .to_return(status: 204)

      expect(client.destroy_instance(instance_id)).to be_nil
    end

    it "raises NotFoundError on 404" do
      stub_request(:delete, "#{base_url}/instances/#{instance_id}")
        .to_return(status: 404, body: '{"error":"instance not found"}', headers: json_headers)

      expect { client.destroy_instance(instance_id) }.to raise_error(GameApi::NotFoundError)
    end
  end

  # --- auth token selection ---

  describe "token selection from comma-separated list" do
    it "uses the first token" do
      c = described_class.new(base_url: base_url, auth_tokens: "first,second,third")
      stub_request(:get, "#{base_url}/instances")
        .to_return(status: 200, body: '{"instances":[]}', headers: json_headers)

      c.list_instances
      expect(WebMock).to have_requested(:get, "#{base_url}/instances")
        .with(headers: {"Authorization" => "Bearer first"})
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
end
