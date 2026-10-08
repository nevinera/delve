require "rails_helper"

RSpec.describe ImportWorldVersionJob, type: :job do
  let(:owner) { create(:user) }
  let!(:installation) { create(:github_installation, user: owner, repo_full_name: "builder/content") }
  let(:world) { create(:world, owner:, repo: "builder/content", path: "worlds/demo.json") }
  let(:version) { create(:world_version, :importing, world:, ref: "demo/v1", commit_sha: nil, raw_base_url: nil) }
  let(:sha) { "c0ffee" }
  let(:raw) { "https://raw.githubusercontent.com/builder/content/#{sha}" }
  let(:api) { "https://api.github.com/repos/builder/content" }

  let(:zone_fixture) { JSON.parse(File.read(Rails.root.join("spec/fixtures/zones/goblin-cave.full.json"))) }
  let(:darkwood) { zone_fixture.merge("openConnections" => {"cave_entrance/clearing_entrance" => "north-exit"}) }
  let(:goblin_cave) { zone_fixture }
  let(:world_data) do
    {
      "name" => "Demo",
      "zones" => {
        "darkwood" => {"path" => "../zones/darkwood/darkwood.json", "name" => "Darkwood"},
        "goblin-cave" => {"path" => "../zones/goblin-cave/goblin-cave.json", "name" => "Goblin Cave"}
      },
      "worldLinks" => [{
        "zoneA" => {"zone" => "darkwood", "kind" => "open", "connection" => "north-exit"},
        "zoneB" => {"zone" => "goblin-cave", "kind" => "entryPoint", "connection" => "cave_entrance/clearing_entrance"},
        "oneWay" => false, "requiredKey" => nil
      }],
      "entryPoints" => {"goblin-cave/cave_entrance/clearing_entrance" => nil}
    }
  end

  def stub_raw(path, body, status: 200)
    stub_request(:get, "#{raw}/#{path}").to_return(status:, body: body.is_a?(String) ? body : body.to_json)
  end

  before do
    stub_request(:get, "#{api}/git/ref/tags/demo/v1")
      .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {object: {type: "commit", sha:}}.to_json)
    stub_raw("worlds/demo.json", world_data)
    stub_raw("zones/darkwood/darkwood.full.json", darkwood)
    stub_raw("zones/goblin-cave/goblin-cave.full.json", goblin_cave)
    stub_request(:get, %r{/quests\.json\z}).to_return(status: 404)
  end

  def perform = described_class.perform_now(version.id)

  context "with a self-contained world" do
    let(:world) { create(:world, owner:, repo: "builder/content", path: "worlds/demo/demo.json") }

    before do
      zones = {
        "darkwood" => {"path" => "./zones/darkwood/darkwood.json", "name" => "Darkwood"},
        "goblin-cave" => {"path" => "./zones/goblin-cave/goblin-cave.json", "name" => "Goblin Cave"}
      }
      stub_raw("worlds/demo/demo.json", world_data.merge("zones" => zones))
      stub_raw("worlds/demo/zones/darkwood/darkwood.full.json", darkwood)
      stub_raw("worlds/demo/zones/goblin-cave/goblin-cave.full.json", goblin_cave)
    end

    it "reads each zone's .full.json from inside the world's directory" do
      perform
      expect(version.reload).to be_unreleased
      expect(version.zones.pluck(:identifier, :path)).to contain_exactly(
        ["darkwood", "worlds/demo/zones/darkwood/darkwood.full.json"],
        ["goblin-cave", "worlds/demo/zones/goblin-cave/goblin-cave.full.json"]
      )
    end
  end

  context "with a valid world" do
    it "marks the version unreleased, pinned to the tag's commit" do
      perform
      version.reload
      expect(version).to be_unreleased
      expect(version.commit_sha).to eq(sha)
      expect(version.raw_base_url).to eq("#{raw}/")
      expect(version.imported_at).to be_present
      expect(version.validity_error).to be_nil
    end

    it "stores the world's name on the version, and on a world that has none yet" do
      perform
      expect(version.reload.name).to eq("Demo")
      expect(world.reload.name).to eq("Demo")
    end

    it "doesn't rename a world that already has a name" do
      world.update!(name: "Released Name")
      perform
      expect(world.reload.name).to eq("Released Name")
    end

    it "marks the default entry point's zone" do
      perform
      expect(version.zones.find_by!(identifier: "goblin-cave").entry_connection_key).to eq("cave_entrance/clearing_entrance")
      expect(version.zones.find_by!(identifier: "darkwood").entry_connection_key).to be_nil
    end

    it "stores where each zone's exits lead" do
      perform
      expect(version.zones.find_by!(identifier: "darkwood").links).to eq(
        "cave_entrance/clearing_entrance" => {"zone" => "goblin-cave", "connection" => "cave_entrance/clearing_entrance"}
      )
      expect(version.zones.find_by!(identifier: "goblin-cave").links).to eq(
        "cave_entrance/clearing_entrance" => {"zone" => "darkwood", "connection" => "cave_entrance/clearing_entrance"}
      )
    end

    it "stores each zone's name and its maps' names" do
      perform
      zone = version.zones.find_by!(identifier: "goblin-cave")
      expect(zone.name).to eq("Goblin Cave")
      expect(zone.map_names).to eq("cave_entrance" => "Cave Entrance", "cave_interior" => "Cave Interior")
    end

    it "creates a zone per world zone, with references and checksums only" do
      perform
      zones = version.zones.order(:identifier)
      expect(zones.map(&:identifier)).to eq(%w[darkwood goblin-cave])
      expect(zones.map(&:path)).to eq(%w[zones/darkwood/darkwood.full.json zones/goblin-cave/goblin-cave.full.json])
      expect(zones.first.content_sha).to eq(Digest::SHA1.hexdigest(darkwood.to_json))
    end
  end

  context "when run again" do
    it "replaces the zones" do
      perform
      old_ids = version.zones.pluck(:id)
      perform
      expect(version.zones.count).to eq(2)
      expect(version.zones.pluck(:id)).not_to include(*old_ids)
    end
  end

  shared_examples "a failed import" do |message|
    it "marks the version failed with the error" do
      perform
      expect(version.reload).to be_failed
      expect(version.validity_error).to match(message)
    end
  end

  context "when a zone's .full.json is missing" do
    before { stub_raw("zones/goblin-cave/goblin-cave.full.json", "Not Found", status: 404) }

    it_behaves_like "a failed import", %r{zones/goblin-cave/goblin-cave.full.json: HTTP 404}
  end

  context "when the world file isn't valid JSON" do
    before { stub_raw("worlds/demo.json", "{nope") }

    it_behaves_like "a failed import", %r{worlds/demo.json: invalid JSON}
  end

  context "when the world file fails validation" do
    before { stub_raw("worlds/demo.json", world_data.except("entryPoints")) }

    it_behaves_like "a failed import", %r{worlds/demo.json: .*entryPoints}
  end

  context "when a zone fails validation" do
    before { stub_raw("zones/darkwood/darkwood.full.json", {"name" => "Darkwood"}) }

    it_behaves_like "a failed import", %r{zones/darkwood/darkwood.full.json: }
  end

  context "when a world link doesn't resolve" do
    let(:darkwood) { zone_fixture }

    it_behaves_like "a failed import", /no openConnection "north-exit"/
  end

  context "when every entry point needs a key" do
    before do
      world_data["entryPoints"] = {"goblin-cave/cave_entrance/clearing_entrance" => "gold-key"}
      stub_raw("worlds/demo.json", world_data)
    end

    it_behaves_like "a failed import", /every entry point needs a key/
  end

  context "when a zone path leaves the repo" do
    before do
      world_data["zones"]["darkwood"]["path"] = "../../elsewhere/darkwood.json"
      stub_raw("worlds/demo.json", world_data)
    end

    it_behaves_like "a failed import", /outside the repo/
  end

  context "with a quests file" do
    let(:quests) do
      [{
        "identifier" => "goblin-hunt", "name" => "Goblin Hunt", "chainIdentifier" => "hunts", "chainName" => "Hunts",
        "offeredBy" => {"zone" => "goblin-cave", "ncu" => "grizzle"}, "offerText" => "Any work?",
        "description" => "Thin them out.",
        "objectives" => [{"type" => "kill", "text" => "Kill goblins", "zone" => "goblin-cave", "unitType" => "goblin", "count" => 3}]
      }]
    end
    let(:goblin_cave) do
      maps = zone_fixture["maps"].dup
      maps[0] = maps[0].merge("ncus" => [ncu_fixture])
      zone_fixture.merge("maps" => maps)
    end
    let(:ncu_fixture) do
      {"identifier" => "grizzle", "name" => "Grizzle", "tokenImageUrl" => "g.webp", "tokenRadius" => 2.0,
       "position" => {"x" => 1.0, "y" => 1.0, "angle" => 0.0}}
    end

    before do
      world_data["questsPath"] = "./demo.quests.json"
      stub_raw("worlds/demo.json", world_data)
      stub_raw("worlds/demo.quests.json", quests)
    end

    it "pins the quests file's path and checksum on the version" do
      perform
      version.reload
      expect(version).to be_unreleased
      expect(version.quests_path).to eq("worlds/demo.quests.json")
      expect(version.quests_sha).to eq(Digest::SHA1.hexdigest(quests.to_json))
    end

    context "when a quest fails validation" do
      before { stub_raw("worlds/demo.quests.json", [quests[0].except("name")]) }

      it_behaves_like "a failed import", %r{worlds/demo.quests.json: name is required}
    end

    context "when a quest references something missing" do
      let(:ncu_fixture) { super().merge("identifier" => "someone-else") }

      it_behaves_like "a failed import", %r{worlds/demo.quests.json: zone "goblin-cave" has no NCU "grizzle"}
    end

    context "when the quests path leaves the repo" do
      before do
        world_data["questsPath"] = "../../elsewhere/demo.quests.json"
        stub_raw("worlds/demo.json", world_data)
      end

      it_behaves_like "a failed import", /quests path .* is outside the repo/
    end
  end

  context "with a quests file at the default path" do
    before { stub_raw("worlds/quests.json", []) }

    it "pins it" do
      perform
      expect(version.reload).to have_attributes(quests_path: "worlds/quests.json", quests_sha: Digest::SHA1.hexdigest("[]"))
    end
  end

  context "with no questsPath and nothing at the default path" do
    it "imports with no quests file" do
      perform
      expect(version.reload).to be_unreleased
      expect(version).to have_attributes(quests_path: nil, quests_sha: nil)
    end
  end

  context "when the questsPath file is missing" do
    before do
      world_data["questsPath"] = "./demo.quests.json"
      stub_raw("worlds/demo.json", world_data)
      stub_raw("worlds/demo.quests.json", "Not Found", status: 404)
    end

    it_behaves_like "a failed import", %r{worlds/demo.quests.json: HTTP 404}
  end

  context "when the tag doesn't exist" do
    before { stub_request(:get, "#{api}/git/ref/tags/demo/v1").to_return(status: 404, body: "{}") }

    it_behaves_like "a failed import", /not found/
  end

  context "when the owner's GitHub connection points at another repo" do
    before { installation.update!(repo_full_name: "builder/other") }

    it_behaves_like "a failed import", %r{points at builder/other}
  end

  context "when something unexpected goes wrong" do
    before { stub_request(:get, "#{raw}/worlds/demo.json").to_raise(Errno::ECONNRESET) }

    it "marks the version failed and re-raises" do
      expect { perform }.to raise_error(Errno::ECONNRESET)
      expect(version.reload).to be_failed
      expect(version.validity_error).to start_with("unexpected import error:")
    end
  end

  context "when a reimport fails" do
    it "keeps the existing zones and pin" do
      perform
      zone_ids = version.zones.pluck(:id)
      stub_raw("zones/darkwood/darkwood.full.json", "Not Found", status: 404)
      perform
      expect(version.reload).to be_failed
      expect(version.zones.pluck(:id)).to match_array(zone_ids)
      expect(version.raw_base_url).to eq("#{raw}/")
    end
  end
end
