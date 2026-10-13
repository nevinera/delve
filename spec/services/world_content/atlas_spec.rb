require "rails_helper"

RSpec.describe WorldContent::Atlas do
  let(:fixture) { JSON.parse(File.read(Rails.root.join("spec/fixtures/zones/goblin-cave.full.json"))) }
  let(:cave) { fixture.deep_dup.tap { |z| z["maps"][0]["thumbnailUrl"] = "cave_entrance/cave_entrance.thumb.webp" } }
  let(:darkwood) { fixture.merge("name" => "Darkwood", "openConnections" => {"cave_entrance/clearing_entrance" => "north-exit"}) }
  let(:zones) do
    {
      "goblin-cave" => {data: cave, url: "https://raw.example/c0ffee/zones/goblin-cave/goblin-cave.full.json"},
      "darkwood" => {data: darkwood, url: "https://raw.example/c0ffee/zones/darkwood/darkwood.full.json"}
    }
  end
  let(:square) { [{"x" => 0, "y" => 0}, {"x" => 250, "y" => 0}, {"x" => 250, "y" => 400}, {"x" => 0, "y" => 400}] }
  let(:zone_link_key) { "goblin-cave/cave_entrance/cave_mouth|goblin-cave/cave_interior/entrance" }
  let(:world_data) do
    {
      "worldLinks" => [{
        "zoneA" => {"zone" => "darkwood", "kind" => "open", "connection" => "north-exit"},
        "zoneB" => {"zone" => "goblin-cave", "kind" => "entryPoint", "connection" => "cave_entrance/clearing_entrance"},
        "oneWay" => false, "requiredKey" => nil
      }],
      "atlas" => {
        "zones" => {
          "goblin-cave" => {"outline" => square, "maps" => {"cave_entrance" => {"x" => 0, "y" => 0}, "cave_interior" => {"x" => 0, "y" => 180}}},
          "darkwood" => {"outline" => square.map { |p| p.merge("x" => p["x"] + 300) }, "maps" => {"cave_entrance" => {"x" => 300, "y" => 0}}}
        },
        "bends" => {zone_link_key => {"x" => 10, "y" => 0}}
      }
    }
  end

  def payload = described_class.payload(world_data, zones)

  it "is nil for a world with no atlas" do
    expect(described_class.payload({}, zones)).to be_nil
  end

  it "names and outlines each laid-out zone" do
    expect(payload["zones"]).to eq(
      "goblin-cave" => {"name" => cave["name"], "outline" => square},
      "darkwood" => {"name" => "Darkwood", "outline" => world_data.dig("atlas", "zones", "darkwood", "outline")}
    )
  end

  it "places each map, with its size, name and thumbnail beside its zone file" do
    entrance = payload["maps"].find { |m| m["zone"] == "goblin-cave" && m["map"] == "cave_entrance" }
    expect(entrance).to eq(
      "zone" => "goblin-cave", "map" => "cave_entrance", "name" => "Cave Entrance", "x" => 0, "y" => 0, "width" => 200.0, "height" => 150.0,
      "thumbnail_url" => "https://raw.example/c0ffee/zones/goblin-cave/cave_entrance/cave_entrance.thumb.webp"
    )
    expect(payload["maps"].size).to eq(3)
  end

  it "draws zone links between their connections, bent as the atlas says" do
    line = payload["links"].find { |l| l["kind"] == "zone" && l["key"] == zone_link_key }
    expect(line["from"]).to eq("x" => 60.0, "y" => 120.0)
    expect(line["to"]["x"]).to be_within(1e-9).of(66.55)
    expect(line["to"]["y"]).to eq(180.0)
    expect(line["through"]["x"]).to be_within(1e-9).of(73.275)
    expect(line["ends"]).to eq([{"zone" => "goblin-cave", "map" => "cave_entrance"}, {"zone" => "goblin-cave", "map" => "cave_interior"}])
  end

  it "draws world links between the connections their sides resolve to" do
    line = payload["links"].find { |l| l["kind"] == "world" }
    expect(line["key"]).to eq("darkwood/cave_entrance/clearing_entrance|goblin-cave/cave_entrance/clearing_entrance")
    expect(line["from"]).to eq("x" => 366.75, "y" => 0.0)
    expect(line["to"]).to eq("x" => 66.75, "y" => 0.0)
    expect(line["through"]).to be_nil
  end

  it "leaves out links with an end not laid out" do
    world_data["atlas"]["zones"]["goblin-cave"]["maps"].delete("cave_interior")
    expect(payload["links"].map { |l| l["kind"] }).to eq(%w[world])
  end
end
