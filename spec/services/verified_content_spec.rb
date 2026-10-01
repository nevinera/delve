require "rails_helper"

RSpec.describe "WorldContent and VerifiedContent" do
  let(:body) { {"name" => "Darkwood"}.to_json }
  let(:version) { create(:world_version, raw_base_url: "https://raw.githubusercontent.com/a/b/c0ffee/") }
  let(:zone) do
    create(:zone, world_version: version, path: "zones/dw/dw.full.json", content_sha: Digest::SHA1.hexdigest(body))
  end
  let(:url) { "https://raw.githubusercontent.com/a/b/c0ffee/zones/dw/dw.full.json" }

  describe ".zone" do
    it "returns the parsed zone file when its checksum matches" do
      stub_request(:get, url).to_return(body:)
      expect(WorldContent.zone(zone)).to eq("name" => "Darkwood")
    end

    it "raises ChecksumMismatch when the file changed since import" do
      stub_request(:get, url).to_return(body: {"name" => "Changed"}.to_json)
      expect { WorldContent.zone(zone) }.to raise_error(VerifiedContent::ChecksumMismatch)
    end

    it "raises FetchError on a failed request" do
      stub_request(:get, url).to_return(status: 404)
      expect { WorldContent.zone(zone) }.to raise_error(VerifiedContent::FetchError, /HTTP 404/)
    end

    it "fetches fresh every time" do
      stub = stub_request(:get, url).to_return(body:)
      2.times { WorldContent.zone(zone) }
      expect(stub).to have_been_requested.twice
    end
  end
end
