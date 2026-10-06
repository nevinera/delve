require "rails_helper"

RSpec.describe ProvenanceRestrictions do
  def item_from(world_key, elvl: 100)
    return build(:character_item, elvl:) if world_key.nil?
    world = World.find_by(path: "worlds/#{world_key}.json") || create(:world, path: "worlds/#{world_key}.json")
    build(:character_item, elvl:, world_version: create(:world_version, world:))
  end

  def restrictions(layers, own: "home") = described_class.new(layers:, own_world_key: own)

  it "allows everything when there are no layers" do
    expect(restrictions([]).allows?(item_from("other"))).to be(true)
  end

  it "always allows trainee gear" do
    layers = [{"worlds" => [], "maxElevation" => 0}]
    expect(restrictions(layers).allows?(item_from(nil, elvl: 900))).to be(true)
  end

  it "treats a nil worlds list as any world" do
    expect(restrictions([{"worlds" => nil}]).allows?(item_from("other"))).to be(true)
  end

  it "allows the own world when worlds is empty" do
    expect(restrictions([{"worlds" => []}]).allows?(item_from("home"))).to be(true)
  end

  it "rejects an unlisted world" do
    expect(restrictions([{"worlds" => []}]).allows?(item_from("other"))).to be(false)
  end

  it "allows a listed world" do
    expect(restrictions([{"worlds" => ["other"]}]).allows?(item_from("other"))).to be(true)
  end

  it "rejects items above maxElevation and allows those at it" do
    layers = [{"maxElevation" => 400}]
    expect(restrictions(layers).allows?(item_from("home", elvl: 401))).to be(false)
    expect(restrictions(layers).allows?(item_from("home", elvl: 400))).to be(true)
  end

  it "requires every layer to pass" do
    layers = [{"worlds" => ["other"]}, {"maxElevation" => 50}]
    expect(restrictions(layers).allows?(item_from("other", elvl: 100))).to be(false)
    expect(restrictions(layers).allows?(item_from("other", elvl: 10))).to be(true)
  end

  describe ".layers_for" do
    it "is empty for a zone with no restrictions played on its own" do
      expect(described_class.layers_for(zone: nil)).to eq([])
    end

    it "uses the zone's restrictions as they are when played on its own" do
      expect(described_class.layers_for(zone: {"maxElevation" => 5}))
        .to eq([{"worlds" => nil, "maxElevation" => 5}])
    end

    it "restricts a world with no restrictions to its own items" do
      expect(described_class.layers_for(world: nil, in_world: true))
        .to eq([{"worlds" => [], "maxElevation" => nil}])
    end

    it "layers the world's restrictions under the zone's" do
      layers = described_class.layers_for(world: {"worlds" => ["a"]}, zone: {"maxElevation" => 9}, in_world: true)
      expect(layers).to eq([{"worlds" => ["a"], "maxElevation" => nil}, {"worlds" => nil, "maxElevation" => 9}])
    end
  end

  describe ".from_param" do
    it "accepts plain hashes" do
      result = described_class.from_param([{"worlds" => []}], own_world_key: "home")
      expect(result.allows?(item_from("other"))).to be(false)
    end

    it "accepts ActionController parameters" do
      params = ActionController::Parameters.new(r: [{"worlds" => [], "maxElevation" => "10"}])
      result = described_class.from_param(params[:r], own_world_key: "home")
      expect(result.allows?(item_from("home", elvl: 11))).to be(false)
    end
  end
end
