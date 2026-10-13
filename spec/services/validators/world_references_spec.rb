require "rails_helper"

RSpec.describe Validators::WorldReferences do
  let(:zones) do
    {
      "darkwood" => {"entryPoints" => {"camp/spawn" => nil}, "openConnections" => {"road/north" => "north-exit"}},
      "goblin-cave" => {"entryPoints" => {"cave/mouth" => nil}}
    }
  end
  let(:link) do
    {
      "zoneA" => {"zone" => "darkwood", "kind" => "open", "connection" => "north-exit"},
      "zoneB" => {"zone" => "goblin-cave", "kind" => "entryPoint", "connection" => "cave/mouth"},
      "oneWay" => false, "requiredKey" => nil
    }
  end
  let(:world) { {"worldLinks" => [link], "entryPoints" => {"darkwood/camp/spawn" => nil}} }

  def validate! = described_class.validate!(world, zones)

  it "accepts links and entry points that resolve" do
    expect { validate! }.not_to raise_error
  end

  it "accepts a world with no links" do
    world.delete("worldLinks")
    expect { validate! }.not_to raise_error
  end

  it "rejects a link to an unknown zone" do
    link["zoneB"]["zone"] = "nowhere"
    expect { validate! }.to raise_error(Validators::ValidationError, /unknown zone "nowhere".*worldLinks\[0\]\.zoneB/)
  end

  it "rejects an open side naming something that isn't an openConnection" do
    link["zoneA"]["connection"] = "road/north"
    expect { validate! }.to raise_error(Validators::ValidationError, /no openConnection "road\/north"/)
  end

  it "rejects an entryPoint side that isn't one of the zone's entry points" do
    link["zoneB"]["connection"] = "cave/back"
    expect { validate! }.to raise_error(Validators::ValidationError, /no entryPoint "cave\/back"/)
  end

  it "rejects a world entry point on an unknown zone" do
    world["entryPoints"] = {"nowhere/camp/spawn" => nil}
    expect { validate! }.to raise_error(Validators::ValidationError, /unknown zone "nowhere"/)
  end

  it "rejects a world entry point the zone doesn't have" do
    world["entryPoints"] = {"darkwood/camp/tent" => nil}
    expect { validate! }.to raise_error(Validators::ValidationError, /no entryPoint "camp\/tent"/)
  end
  describe "atlas" do
    def loc(x, y) = {"x" => x, "y" => y}
    def outline(x, y, size) = [loc(x, y), loc(x + size, y), loc(x + size, y + size), loc(x, y + size)]

    before do
      zones["darkwood"]["maps"] = [
        {"identifier" => "camp", "feetDimensions" => {"width" => 100, "height" => 100}},
        {"identifier" => "road", "feetDimensions" => {"width" => 100, "height" => 50}}
      ]
      zones["goblin-cave"]["maps"] = [{"identifier" => "cave", "feetDimensions" => {"width" => 80, "height" => 80}}]
      world["atlas"] = {"zones" => {
        "darkwood" => {"outline" => outline(0, 0, 200), "maps" => {"camp" => loc(0, 0), "road" => loc(0, 100)}},
        "goblin-cave" => {"outline" => outline(200, 0, 100), "maps" => {"cave" => loc(200, 0)}}
      }}
    end

    def darkwood = world["atlas"]["zones"]["darkwood"]

    it "accepts maps inside their zones, touching but not overlapping" do
      expect { validate! }.not_to raise_error
    end

    it "accepts a zone with only some of its maps placed, or none at all" do
      darkwood["maps"].delete("road")
      world["atlas"]["zones"].delete("goblin-cave")
      expect { validate! }.not_to raise_error
    end

    it "rejects an unknown zone" do
      world["atlas"]["zones"]["nowhere"] = {"outline" => outline(500, 500, 10), "maps" => {}}
      expect { validate! }.to raise_error(Validators::ValidationError, /unknown zone "nowhere".*atlas\.zones\.nowhere/)
    end

    it "rejects a map the zone doesn't have" do
      darkwood["maps"]["cave"] = loc(100, 0)
      expect { validate! }.to raise_error(Validators::ValidationError, /zone "darkwood" has no map "cave"/)
    end

    it "rejects a map outside its zone's outline" do
      darkwood["maps"]["road"] = loc(150, 100)
      expect { validate! }.to raise_error(Validators::ValidationError, /map "road" isn't inside its zone's outline/)
    end

    it "rejects overlapping maps" do
      darkwood["maps"]["road"] = loc(50, 50)
      expect { validate! }.to raise_error(Validators::ValidationError, %r{map "darkwood/road" overlaps "darkwood/camp"})
    end

    it "rejects overlapping zone outlines" do
      world["atlas"]["zones"]["goblin-cave"]["outline"] = outline(150, 0, 150)
      world["atlas"]["zones"]["goblin-cave"]["maps"]["cave"] = loc(210, 0)
      expect { validate! }.to raise_error(Validators::ValidationError, /zone "goblin-cave"'s outline overlaps "darkwood"'s/)
    end
  end
end
