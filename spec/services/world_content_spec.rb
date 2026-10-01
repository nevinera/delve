require "rails_helper"

RSpec.describe WorldContent do
  let(:world) { create(:world, path: "worlds/demo.json") }
  let(:world_body) { {"name" => "Demo"}.to_json }
  let(:version) do
    create(:world_version, world:, raw_base_url: "https://raw.githubusercontent.com/a/b/c0ffee/",
      content_sha: Digest::SHA1.hexdigest(world_body))
  end
  let(:world_url) { "https://raw.githubusercontent.com/a/b/c0ffee/worlds/demo.json" }

  describe ".world" do
    it "returns the parsed world file when its checksum matches" do
      stub_request(:get, world_url).to_return(body: world_body)
      expect(described_class.world(version)).to eq("name" => "Demo")
    end

    it "raises ChecksumMismatch when the file changed since import" do
      stub_request(:get, world_url).to_return(body: {"name" => "Changed"}.to_json)
      expect { described_class.world(version) }.to raise_error(WorldContent::ChecksumMismatch)
    end

    it "raises FetchError on a failed request" do
      stub_request(:get, world_url).to_return(status: 404)
      expect { described_class.world(version) }.to raise_error(WorldContent::FetchError, /HTTP 404/)
    end

    it "caches by checksum" do
      allow(Rails).to receive(:cache).and_return(ActiveSupport::Cache::MemoryStore.new)
      stub = stub_request(:get, world_url).to_return(body: world_body)
      2.times { described_class.world(version) }
      expect(stub).to have_been_requested.once
    end
  end

  describe ".zone" do
    it "reads the zone's .full.json at the version's base URL" do
      body = {"name" => "Darkwood"}.to_json
      zone = create(:zone, :in_world, world_version: version, path: "zones/dw/dw.full.json",
        content_sha: Digest::SHA1.hexdigest(body))
      stub_request(:get, "https://raw.githubusercontent.com/a/b/c0ffee/zones/dw/dw.full.json").to_return(body:)
      expect(described_class.zone(zone)).to eq("name" => "Darkwood")
    end
  end
end
