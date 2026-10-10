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
    character.character_class.update!(content_sha: Digest::SHA1.hexdigest(class_content))
  end

  def call
    described_class.call(world_character:, zone:, zone_data: WorldContent.zone(zone), owned_zone_items: {"sword" => false},
      held_flags: ["key/gate"])
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

  it "sends the character's token image" do
    call
    expect(slots_client).to have_received(:request).with(hash_including(token_image_url: "https://example.com/token.webp"))
  end

  it "sends the world key and the world's restriction layer" do
    call
    expect(slots_client).to have_received(:request).with(hash_including(
      provenance_restrictions: {world_key: world_character.world.key, layers: [{"worlds" => [], "maxElevation" => nil}]}
    ))
  end

  it "sends the character's active quests, and no quests file when the world has none" do
    quest = create(:character_quest, world_character:, quest_identifier: "rat-hunt")
    call
    expect(slots_client).to have_received(:request).with(hash_including(active_quests: [CharacterQuestJson.call(quest)]))
    expect(slots_client).to have_received(:request).with(hash_excluding(:quests_url, :quests_sha))
  end

  it "sends the world's quests file" do
    version.update!(quests_path: "worlds/quests.json", quests_sha: "abc123")
    call
    expect(slots_client).to have_received(:request).with(hash_including(
      quests_url: "#{version.raw_base_url}worlds/quests.json", quests_sha: "abc123"
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
    version.update!(quests_path: "worlds/quests.json", quests_sha: "abc123")
    allow(GameApi).to receive(:slots).and_call_original
    stub_request(:post, %r{/slots/request}).to_return(status: 201, headers: {"Content-Type" => "application/json"},
      body: {instance_identifier: "inst", slot_id: "slot", token: "tok"}.to_json)
    expect { call }.not_to raise_error
  end

  it "replaces the character's existing session" do
    other = create(:zone)
    create(:slot_session, character:, zone: other, token: "old")
    expect { call }.not_to change(SlotSession, :count)
    expect(SlotSession.find_by!(character:)).to have_attributes(zone:, token: "tok", last_confirmed_at: be_present)
  end

  it "sends the owned items it's given, and the world character's equipment" do
    item = create(:character_item, world_character:, slot: "head")
    create(:equipped_item, world_character:, character_item: item, equipped_slot: "head")
    call
    expect(slots_client).to have_received(:request).with(hash_including(
      owned_zone_items: {"sword" => false},
      held_flags: ["key/gate"],
      equipped_items: EquippedItems::ForWorldCharacter.call(world_character:)
    ))
  end

  it "refuses a class file that changed since the class was fetched" do
    character.character_class.update!(content_sha: "stale")
    expect { call }.to raise_error(VerifiedContent::ChecksumMismatch, /class file has changed since it was checked; it needs refetching/)
    expect(slots_client).not_to have_received(:request)
  end

  it "propagates game server errors" do
    allow(slots_client).to receive(:request).and_raise(GameApi::CapacityError.new("full", status: 406))
    expect { call }.to raise_error(GameApi::CapacityError)
  end
end
