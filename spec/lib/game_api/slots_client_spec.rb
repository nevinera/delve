require "rails_helper"

RSpec.describe GameApi::SlotsClient do
  let(:base_url) { "http://game-test.local" }
  let(:token) { "test-token-abc" }
  let(:client) { described_class.new(base_url: base_url, auth_tokens: token) }

  let(:json_headers) { {"Content-Type" => "application/json"} }
  let(:instance_id) { "550e8400-e29b-41d4-a716-446655440000" }
  let(:slot_id) { "660e8400-e29b-41d4-a716-446655440001" }

  let(:puncher_class) do
    {"name" => "Puncher", "colors" => {"major" => "8B4513", "minor" => "F4A460"}}
  end

  let(:slot_body) do
    {id: slot_id, state: "pending", character_name: "Aldric"}.to_json
  end

  # --- active ---

  describe "#active" do
    let(:active_slot) do
      {
        instance_identifier: "inst-uuid", slot_id: slot_id, token: "tok-uuid",
        character_name: "Aldric", state: "connected"
      }.to_json
    end

    it "returns the active slots list" do
      stub_request(:get, "#{base_url}/slots/active")
        .to_return(status: 200, body: %({"slots":[#{active_slot}]}), headers: json_headers)

      result = client.active
      expect(result["slots"].length).to eq(1)
      expect(result["slots"].first["token"]).to eq("tok-uuid")
      expect(result["slots"].first["state"]).to eq("connected")
    end

    it "sends the Bearer token" do
      stub_request(:get, "#{base_url}/slots/active")
        .to_return(status: 200, body: '{"slots":[]}', headers: json_headers)

      client.active
      expect(WebMock).to have_requested(:get, "#{base_url}/slots/active")
        .with(headers: {"Authorization" => "Bearer #{token}"})
    end

    it "returns empty slots when none are active" do
      stub_request(:get, "#{base_url}/slots/active")
        .to_return(status: 200, body: '{"slots":[]}', headers: json_headers)

      result = client.active
      expect(result["slots"]).to eq([])
    end
  end

  # --- list ---

  describe "#list" do
    it "returns the slots list" do
      stub_request(:get, "#{base_url}/instances/#{instance_id}/slots")
        .to_return(status: 200, body: '{"slots":[]}', headers: json_headers)

      result = client.list(instance_id: instance_id)
      expect(result["slots"]).to eq([])
    end

    it "sends the Bearer token" do
      stub_request(:get, "#{base_url}/instances/#{instance_id}/slots")
        .to_return(status: 200, body: '{"slots":[]}', headers: json_headers)

      client.list(instance_id: instance_id)
      expect(WebMock).to have_requested(:get, "#{base_url}/instances/#{instance_id}/slots")
        .with(headers: {"Authorization" => "Bearer #{token}"})
    end

    it "raises NotFoundError when instance does not exist" do
      stub_request(:get, "#{base_url}/instances/#{instance_id}/slots")
        .to_return(status: 404, body: '{"error":"instance not found"}', headers: json_headers)

      expect { client.list(instance_id: instance_id) }.to raise_error(GameApi::NotFoundError)
    end
  end

  # --- show ---

  describe "#show" do
    it "returns the slot" do
      stub_request(:get, "#{base_url}/instances/#{instance_id}/slots/#{slot_id}")
        .to_return(status: 200, body: slot_body, headers: json_headers)

      result = client.show(instance_id: instance_id, slot_id: slot_id)
      expect(result["id"]).to eq(slot_id)
      expect(result["state"]).to eq("pending")
    end

    it "raises NotFoundError when slot does not exist" do
      stub_request(:get, "#{base_url}/instances/#{instance_id}/slots/#{slot_id}")
        .to_return(status: 404, body: '{"error":"slot not found"}', headers: json_headers)

      expect { client.show(instance_id: instance_id, slot_id: slot_id) }
        .to raise_error(GameApi::NotFoundError)
    end
  end

  # --- create ---

  describe "#create" do
    let(:created_body) do
      {id: slot_id, token: "some-token-uuid", state: "pending", character_name: "Aldric"}.to_json
    end

    def call_create
      client.create(
        instance_id: instance_id,
        character_name: "Aldric",
        character_class: puncher_class
      )
    end

    it "POSTs to the slots path and returns the created slot with token" do
      stub_request(:post, "#{base_url}/instances/#{instance_id}/slots")
        .to_return(status: 201, body: created_body, headers: json_headers)

      result = call_create
      expect(result["id"]).to eq(slot_id)
      expect(result["token"]).to eq("some-token-uuid")
      expect(result["state"]).to eq("pending")
    end

    it "does not include instance_id in the request body" do
      stub_request(:post, "#{base_url}/instances/#{instance_id}/slots")
        .to_return(status: 201, body: created_body, headers: json_headers)

      call_create
      expect(WebMock).to have_requested(:post, "#{base_url}/instances/#{instance_id}/slots")
        .with { |req| !JSON.parse(req.body).key?("instance_id") }
    end

    it "sends character_name and character_class in the body" do
      stub_request(:post, "#{base_url}/instances/#{instance_id}/slots")
        .to_return(status: 201, body: created_body, headers: json_headers)

      call_create
      expect(WebMock).to have_requested(:post, "#{base_url}/instances/#{instance_id}/slots")
        .with { |req|
          body = JSON.parse(req.body)
          body["character_name"] == "Aldric" && body["character_class"] == puncher_class
        }
    end

    context "attr validation" do
      it "raises InvalidAttrsError when character_name is missing" do
        expect {
          client.create(instance_id: instance_id, character_class: puncher_class)
        }.to raise_error(GameApi::InvalidAttrsError, /missing required keys: character_name/)
      end

      it "raises InvalidAttrsError when character_class is missing" do
        expect {
          client.create(instance_id: instance_id, character_name: "Aldric")
        }.to raise_error(GameApi::InvalidAttrsError, /missing required keys: character_class/)
      end

      it "raises InvalidAttrsError for unsupported keys" do
        expect {
          client.create(
            instance_id: instance_id,
            character_name: "Aldric",
            character_class: puncher_class,
            bogus: "nope"
          )
        }.to raise_error(GameApi::InvalidAttrsError, /unsupported keys: bogus/)
      end
    end

    it "raises UnprocessableError on 422" do
      stub_request(:post, "#{base_url}/instances/#{instance_id}/slots")
        .to_return(status: 422, body: '{"error":"instance is at max slot capacity"}', headers: json_headers)

      expect { call_create }.to raise_error(GameApi::UnprocessableError) do |e|
        expect(e.message).to include("max slot capacity")
      end
    end
  end

  # --- destroy ---

  describe "#destroy" do
    it "returns nil on success" do
      stub_request(:delete, "#{base_url}/instances/#{instance_id}/slots/#{slot_id}")
        .to_return(status: 204)

      expect(client.destroy(instance_id: instance_id, slot_id: slot_id)).to be_nil
    end

    it "raises NotFoundError on 404" do
      stub_request(:delete, "#{base_url}/instances/#{instance_id}/slots/#{slot_id}")
        .to_return(status: 404, body: '{"error":"slot not found"}', headers: json_headers)

      expect { client.destroy(instance_id: instance_id, slot_id: slot_id) }
        .to raise_error(GameApi::NotFoundError)
    end
  end
end
