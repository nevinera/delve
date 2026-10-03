require "rails_helper"

RSpec.describe EnterWorld do
  let(:character) { create(:character) }
  let(:version) { published_world }
  let(:world) { version.world }
  let(:join_result) { JoinZone::Result.new(token: "tok", instance_identifier: "inst", slot_id: "slot") }

  before do
    allow(JoinWorldZone).to receive(:call).and_return(join_result)
  end

  def enter = described_class.call(character:, world:)

  it "creates a WorldCharacter at the world's default entry point on first entry" do
    result = enter
    wc = result.world_character
    expect(wc).to have_attributes(world:, character:, world_version: version,
      zone_identifier: "darkwood", connection_key: "camp/spawn")
    expect(wc.last_played_at).to be_present
    expect(result.zone.identifier).to eq("darkwood")
    expect(result.join).to eq(join_result)
  end

  it "joins the chosen zone with its content" do
    enter
    expect(JoinWorldZone).to have_received(:call).with(
      world_character: WorldCharacter.last,
      zone: version.zones.find_by!(identifier: "darkwood"),
      zone_data: hash_including("name" => "Darkwood"),
      owned_zone_items: {}
    )
  end

  it "grants trainee gear on first entry only" do
    enter
    world_character = WorldCharacter.last
    expect(world_character.equipped_items).not_to be_empty
    expect { enter }.not_to change(CharacterItem, :count)
  end

  it "grants trainee gear to a world character created by hiding the world" do
    create(:world_character, world:, character:, active: false)
    expect { enter }.to change(CharacterItem, :count)
  end

  it "explains when the character's class content isn't ready" do
    character.character_class.update!(primary_stats: [], secondary_stats: [], wields: [])
    expect { enter }.to raise_error(EnterWorld::ClassNotReady, /still loading/)
  end

  it "reports which of the zone's items the world character already owns" do
    files = demo_world_files
    item = {"identifier" => "sword", "name" => "Sword", "slot" => "main_hand", "elvl" => 1}
    files[:zones]["darkwood"]["items"] = {"sword" => item}
    other = published_world(files:, world: create(:world, path: "worlds/items.json"))
    wc = create(:world_character, world: other.world, character:)
    create(:character_item, world_character: wc, identifier: "sword", version: ItemDefinition.version(item))
    expect(described_class.call(character:, world: other.world).owned_zone_items).to eq("sword" => true)
  end

  it "doesn't report owned items that aren't in the zone" do
    files = demo_world_files
    item = {"identifier" => "sword", "name" => "Sword", "slot" => "main_hand", "elvl" => 1}
    files[:zones]["darkwood"]["items"] = {"sword" => item}
    other = published_world(files:, world: create(:world, path: "worlds/items.json"))
    wc = create(:world_character, world: other.world, character:)
    create(:character_item, world_character: wc, identifier: "axe", version: "1.0")
    expect(described_class.call(character:, world: other.world).owned_zone_items).to eq({})
  end

  it "re-enters at the saved connection point" do
    create(:world_character, world:, character:, world_version: version, zone_identifier: "cave", connection_key: "mouth/in")
    expect(enter.world_character).to have_attributes(zone_identifier: "cave", connection_key: "mouth/in")
  end

  it "falls back to the entry point when the saved zone is gone" do
    create(:world_character, world:, character:, world_version: version, zone_identifier: "swamp", connection_key: "a/b")
    expect(enter.world_character).to have_attributes(zone_identifier: "darkwood", connection_key: "camp/spawn")
  end

  it "falls back to the entry point when the saved connection is gone" do
    create(:world_character, world:, character:, world_version: version, zone_identifier: "cave", connection_key: "mouth/out")
    expect(enter.world_character).to have_attributes(zone_identifier: "darkwood", connection_key: "camp/spawn")
  end

  it "keeps the character's version while it's available" do
    newer = published_world(world:, released_at: 1.minute.from_now)
    create(:world_character, world:, character:, world_version: version)
    expect(enter.world_character.world_version).to eq(version)
    expect(newer).to be_released
  end

  it "upgrades the character off an expired version" do
    version.update!(expires_at: 1.minute.ago)
    newer = published_world(world:)
    create(:world_character, world:, character:, world_version: version)
    expect(enter.world_character.world_version).to eq(newer)
  end

  it "raises when the world has no released version" do
    version.update!(state: :unreleased)
    expect { enter }.to raise_error(EnterWorld::NoReleasedVersion)
  end

  it "raises when the version has no entry point" do
    version.zones.update_all(entry_connection_key: nil)
    expect { enter }.to raise_error(EnterWorld::NoEntryPoint)
  end
end
