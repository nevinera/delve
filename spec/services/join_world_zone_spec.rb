require "rails_helper"

RSpec.describe JoinWorldZone do
  let(:character) { create(:character) }
  let(:version) { published_world(expires_at: Time.utc(2030, 1, 2, 3, 4, 5)) }
  let(:zone) { version.zones.find_by!(identifier: "darkwood") }
  let(:world_character) do
    create(:world_character, world: version.world, character:, world_version: version,
      zone_identifier: "darkwood", connection_key: "camp/spawn")
  end
  let(:slots_client) { instance_double(GameApi::SlotsClient) }
  let(:class_content) { File.read(Rails.root.join("spec/fixtures/classes/puncher.full.json")) }

  before do
    allow(GameApi).to receive(:slots).and_return(slots_client)
    allow(slots_client).to receive(:request)
      .and_return({"instance_identifier" => "inst", "slot_id" => "slot", "token" => "tok"})
    stub_request(:get, character.character_class.location).to_return(body: class_content)
  end

  def call
    described_class.call(world_character:, zone:, zone_data: WorldContent.zone(zone))
  end

  it "sends a world-mode slot request for the zone" do
    call
    expect(slots_client).to have_received(:request).with(hash_including(
      zone_identifier: "darkwood",
      version: version.commit_sha,
      database_id: zone.id.to_s,
      source_url: version.zone_url(zone),
      zone_config: hash_including("name" => "Darkwood"),
      mode: "world",
      instance_key: "world:#{zone.id}",
      spawn_at: "camp/spawn",
      exits: ["road/north"],
      world_character_database_id: world_character.id.to_s,
      world_version_id: version.id.to_s,
      expires_at: "2030-01-02T03:04:05Z",
      character_name: character.name
    ))
  end

  it "leaves out expires_at when the version isn't expiring" do
    version.update!(expires_at: nil)
    call
    expect(slots_client).to have_received(:request).with(hash_excluding(:expires_at))
  end

  it "records the slot session against the zone" do
    call
    expect(SlotSession.find_by!(character:)).to have_attributes(zone:, token: "tok")
  end

  it "passes every key the game API client accepts" do
    allow(GameApi).to receive(:slots).and_call_original
    stub_request(:post, %r{/slots/request}).to_return(status: 201, headers: {"Content-Type" => "application/json"},
      body: {instance_identifier: "inst", slot_id: "slot", token: "tok"}.to_json)
    expect { call }.not_to raise_error
  end
end
