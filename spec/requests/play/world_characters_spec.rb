require "rails_helper"

RSpec.describe "Play::WorldCharacters", type: :request do
  let(:user) { create(:user) }
  let(:character_class) { create(:character_class, state: :fetched, content_sha: "c1a55sha") }
  let(:character) { create(:character, user:, character_class:) }
  let(:version) { published_world }
  let(:world) { version.world }
  let(:base) { "/play/characters/#{character.id}/worlds" }

  before { sign_in user }

  describe "GET index" do
    it "lists released worlds by name, with Enter and Hide" do
      version
      get base
      expect(response).to have_http_status(:ok)
      expect(response.body).to include("Demo World", "#{base}/#{world.id}/play", "Hide")
    end

    it "leaves out worlds with no released version" do
      unreleased = create(:world, path: "worlds/unreleased.json")
      create(:world_version, world: unreleased)
      get base
      expect(response.body).not_to include("unreleased")
    end

    it "hides worlds the character hid, unless showing all" do
      create(:world_character, world:, character:, active: false)
      get base
      expect(response.body).not_to include("Demo World")
      get base, params: {all: 1}
      expect(response.body).to include("Demo World", "Show")
    end

    it "falls back to the world's key before it has a name" do
      world.update!(name: nil)
      get base
      expect(response.body).to include(">demo<")
    end

    it "returns 404 for another user's character" do
      get "/play/characters/#{create(:character).id}/worlds"
      expect(response).to have_http_status(:not_found)
    end
  end

  describe "GET show" do
    it "shows the world's name and its released versions" do
      get "#{base}/#{world.id}"
      expect(response.body).to include("Demo World", version.ref)
    end

    it "disables switching versions while the character is in the world" do
      zone = version.zones.first
      create(:slot_session, character:, zone:)
      get "#{base}/#{world.id}"
      expect(response.body).to include("Leave the world to switch versions.")
    end
  end

  describe "GET show with gear the world disallows" do
    let(:world_character) { create(:world_character, world:, character:, world_version: version) }

    def wear(name, slot, world_version)
      item = create(:character_item, world_character:, name:, slot:, world_version:)
      create(:equipped_item, world_character:, character_item: item, equipped_slot: slot)
    end

    it "warns and links to the equip screen" do
      wear("Foreign Helm", "head", create(:world_version, world: create(:world)))
      get "#{base}/#{world.id}"
      expect(response.body).to include("does not allow some of your equipped gear", "Foreign Helm",
        "#{base}/#{world.id}/equipped_items")
    end

    it "says nothing when all gear is allowed" do
      wear("Own Helm", "head", version)
      get "#{base}/#{world.id}"
      expect(response.body).not_to include("does not allow")
    end
  end

  describe "GET play" do
    let(:join_result) { JoinZone::Result.new(token: "tok", instance_identifier: "inst", slot_id: "slot") }

    it "enters the world and renders the game client with a return URL" do
      allow(JoinWorldZone).to receive(:call).and_return(join_result)
      get "#{base}/#{world.id}/play"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include('data-slot-token="tok"',
        %(data-world-return-url="#{base}/#{world.id}/play"),
        %(data-zone-source-url="#{version.raw_base_url}zones/darkwood/darkwood.full.json"),
        %(data-zone-source-sha="#{version.zones.find_by!(identifier: "darkwood").content_sha}"),
        %(data-class-config-sha="#{character_class.content_sha}"))
      expect(response.body).not_to include("<nav>")
    end

    it "offers to refetch the class when its file changed" do
      allow(JoinWorldZone).to receive(:call).and_raise(CharacterClasses::ChecksumMismatch, "puncher 0.1's class file has changed")
      character_class.update!(user:)
      get "#{base}/#{world.id}/play"
      expect(response).to have_http_status(:service_unavailable)
      expect(response.body).to include("Refetch class", "/build/character_classes/#{character_class.id}/refetch")
    end

    it "explains when the world can't be entered" do
      stub_request(:get, "#{version.raw_base_url}zones/darkwood/darkwood.full.json").to_return(body: "{}")
      get "#{base}/#{world.id}/play"
      expect(response).to have_http_status(:service_unavailable)
      expect(response.body).to include("enter this world right now", "checksum")
    end
  end

  describe "PATCH active" do
    it "hides a world the character never entered" do
      patch "#{base}/#{world.id}/active", params: {active: "false"}
      expect(WorldCharacter.find_by!(world:, character:)).not_to be_active
    end

    it "shows it again" do
      create(:world_character, world:, character:, active: false)
      patch "#{base}/#{world.id}/active", params: {active: "true"}
      expect(WorldCharacter.find_by!(world:, character:)).to be_active
    end
  end

  describe "PATCH version" do
    let!(:newer) { published_world(world:) }

    it "switches to another available version" do
      patch "#{base}/#{world.id}/version", params: {world_version_id: version.id}
      expect(WorldCharacter.find_by!(world:, character:).world_version).to eq(version)
    end

    it "refuses an expired version" do
      version.update!(expires_at: 1.minute.ago)
      patch "#{base}/#{world.id}/version", params: {world_version_id: version.id}
      expect(response).to have_http_status(:not_found)
    end

    it "refuses while the character is in the world" do
      create(:slot_session, character:, zone: version.zones.first)
      patch "#{base}/#{world.id}/version", params: {world_version_id: version.id}
      expect(WorldCharacter.find_by(world:, character:)).to be_nil
      expect(flash[:alert]).to include("Leave the world")
    end
  end
end
