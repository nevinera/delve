require "rails_helper"

RSpec.describe JoinZone do
  let(:zone) { create(:zone) }
  let(:character) { create(:character) }
  let(:slots_client) { instance_double(GameApi::SlotsClient) }

  let(:zone_content) { File.read(Rails.root.join("spec/fixtures/zones/goblin-cave.full.json")) }
  let(:class_content) { File.read(Rails.root.join("spec/fixtures/classes/puncher.full.json")) }

  let(:instance_id) { SecureRandom.uuid }
  let(:slot_id) { SecureRandom.uuid }
  let(:token) { SecureRandom.uuid }

  let(:request_response) do
    {"instance_identifier" => instance_id, "slot_id" => slot_id, "token" => token}
  end

  before do
    allow(GameApi).to receive(:slots).and_return(slots_client)
    allow(slots_client).to receive(:request).and_return(request_response)

    stub_request(:get, zone.config_url)
      .to_return(status: 200, body: zone_content, headers: {"Content-Type" => "application/json"})
    stub_request(:get, character.character_class.location)
      .to_return(status: 200, body: class_content, headers: {"Content-Type" => "application/json"})
  end

  def call(**opts)
    described_class.call(character: character, zone: zone, **opts)
  end

  describe "#call" do
    it "returns a Result with token, instance_identifier, and slot_id" do
      result = call

      expect(result.token).to eq(token)
      expect(result.instance_identifier).to eq(instance_id)
      expect(result.slot_id).to eq(slot_id)
    end

    it "creates a SlotSession for the character" do
      expect { call }.to change(SlotSession, :count).by(1)

      session = SlotSession.find_by!(character: character)
      expect(session.zone).to eq(zone)
      expect(session.token).to eq(token)
      expect(session.instance_identifier).to eq(instance_id)
      expect(session.slot_id).to eq(slot_id)
    end

    it "sets last_confirmed_at on the session" do
      call
      expect(SlotSession.find_by!(character: character).last_confirmed_at).to be_within(2.seconds).of(Time.current)
    end

    it "replaces an existing session for the same character" do
      existing = create(:slot_session, character: character, zone: zone)

      expect { call }.not_to change(SlotSession, :count)

      expect(existing.reload.token).to eq(token)
    end

    it "sends zone_identifier, version, database_id, source_url, zone_config, character_name, character_class" do
      call

      expect(slots_client).to have_received(:request) do |attrs|
        expect(attrs[:zone_identifier]).to eq(zone.identifier)
        expect(attrs[:version]).to eq(zone.version)
        expect(attrs[:database_id]).to eq(zone.id.to_s)
        expect(attrs[:source_url]).to eq(zone.config_url)
        expect(attrs[:zone_config]).to be_a(Hash)
        expect(attrs[:character_name]).to eq(character.name)
        expect(attrs[:character_class]).to be_a(Hash)
      end
    end

    it "omits instance_identifier when not provided" do
      call

      expect(slots_client).to have_received(:request) do |attrs|
        expect(attrs).not_to have_key(:instance_identifier)
      end
    end

    it "includes instance_identifier when provided" do
      target = SecureRandom.uuid
      call(instance_identifier: target)

      expect(slots_client).to have_received(:request) do |attrs|
        expect(attrs[:instance_identifier]).to eq(target)
      end
    end

    it "propagates CapacityError from the game server" do
      allow(slots_client).to receive(:request).and_raise(GameApi::CapacityError.new("at capacity", status: 406))

      expect { call }.to raise_error(GameApi::CapacityError)
    end

    it "raises when the zone config URL returns a non-success response" do
      stub_request(:get, zone.config_url).to_return(status: 404)

      expect { call }.to raise_error(RuntimeError, /HTTP 404/)
    end
  end
end
