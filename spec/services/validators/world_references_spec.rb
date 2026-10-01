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
end
