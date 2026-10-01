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
  let(:zone_data_for) { ->(key) { zones.fetch(key) } }
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

  describe ".exits_for" do
    it "maps open names back to connection keys" do
      expect(described_class.exits_for(world, "darkwood", darkwood)).to eq(["road/north"])
    end

    it "includes both two-way and one-way-departure sides, but not one-way arrivals" do
      expect(described_class.exits_for(world, "cave", cave)).to contain_exactly("mouth/in", "mouth/drop")
    end

    it "skips links that need a key" do
      links.each { |link| link["requiredKey"] = "gold-key" }
      expect(described_class.exits_for(world, "cave", cave)).to be_empty
    end
  end

  describe ".destination" do
    it "follows a link from A to B" do
      expect(described_class.destination(world, "darkwood", "road/north", zone_data_for)).to eq(["cave", "mouth/in"])
    end

    it "follows a two-way link back from B to A" do
      expect(described_class.destination(world, "cave", "mouth/in", zone_data_for)).to eq(["darkwood", "road/north"])
    end

    it "follows a one-way link forward only" do
      expect(described_class.destination(world, "cave", "mouth/drop", zone_data_for)).to eq(["darkwood", "road/south"])
      expect(described_class.destination(world, "darkwood", "road/south", zone_data_for)).to be_nil
    end

    it "returns nil for a connection that isn't linked" do
      expect(described_class.destination(world, "darkwood", "road/elsewhere", zone_data_for)).to be_nil
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
