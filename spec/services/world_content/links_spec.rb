require "rails_helper"

RSpec.describe WorldContent::Links do
  let(:darkwood) do
    {
      "maps" => [{"identifier" => "road", "connections" => [{"identifier" => "north"}, {"identifier" => "south"}]}],
      "openConnections" => {"road/north" => "north-exit"},
      "entryPoints" => {"road/south" => nil}
    }
  end
  let(:cave) do
    {
      "maps" => [{"identifier" => "mouth", "connections" => [{"identifier" => "in"}, {"identifier" => "drop"}]}],
      "entryPoints" => {"mouth/in" => nil, "mouth/drop" => nil}
    }
  end
  let(:zones) { {"darkwood" => darkwood, "cave" => cave} }
  let(:links) do
    [
      {
        "zoneA" => {"zone" => "darkwood", "kind" => "open", "connection" => "north-exit"},
        "zoneB" => {"zone" => "cave", "kind" => "entryPoint", "connection" => "mouth/in"},
        "oneWay" => false, "requiredKey" => nil
      },
      {
        "zoneA" => {"zone" => "cave", "kind" => "entryPoint", "connection" => "mouth/drop"},
        "zoneB" => {"zone" => "darkwood", "kind" => "entryPoint", "connection" => "road/south"},
        "oneWay" => true, "requiredKey" => nil
      }
    ]
  end
  let(:world) { {"worldLinks" => links, "entryPoints" => {"cave/mouth/in" => "key", "darkwood/road/south" => nil}} }

  describe ".links_for" do
    it "maps each exit to the far side, translating open names to connection keys" do
      expect(described_class.links_for(world, "darkwood", zones)).to eq(
        "road/north" => {"zone" => "cave", "connection" => "mouth/in"}
      )
    end

    it "includes two-way links back, and one-way departures but not one-way arrivals" do
      expect(described_class.links_for(world, "cave", zones)).to eq(
        "mouth/in" => {"zone" => "darkwood", "connection" => "road/north"},
        "mouth/drop" => {"zone" => "darkwood", "connection" => "road/south"}
      )
    end

    it "skips links that need a key" do
      links.each { |link| link["requiredKey"] = "gold-key" }
      expect(described_class.links_for(world, "cave", zones)).to be_empty
    end
  end

  describe ".default_entry" do
    it "returns the first entry point that needs no key" do
      expect(described_class.default_entry(world)).to eq(["darkwood", "road/south"])
    end

    it "returns nil when every entry point needs a key" do
      expect(described_class.default_entry({"entryPoints" => {"cave/mouth/in" => "key"}})).to be_nil
    end
  end

  describe ".connection_exists?" do
    it "checks the zone's maps" do
      expect(described_class.connection_exists?(darkwood, "road/north")).to be(true)
      expect(described_class.connection_exists?(darkwood, "road/west")).to be(false)
      expect(described_class.connection_exists?(darkwood, "nowhere/north")).to be(false)
      expect(described_class.connection_exists?(darkwood, nil)).to be(false)
    end
  end
end
