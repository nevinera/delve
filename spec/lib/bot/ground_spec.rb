require "rails_helper"

RSpec.describe Bot::Ground do
  # The world and what /create makes of it, from game-server/internal/worlds/testdata/world.mjs.
  let(:testdata) { Rails.root.join("game-server/internal/worlds/testdata") }
  let(:expected) { JSON.parse(testdata.join("expected.json").read) }
  let(:fetched) { [] }
  let(:ground) do
    prefix = "https://raw.githubusercontent.com/me/w/c0ffee/"
    described_class.new(repo: "me/w", sha: "c0ffee", continent: "main", fetch: ->(url) {
      fetched << url
      file = testdata.join("world", url.delete_prefix(prefix))
      file.read if url.start_with?(prefix) && file.exist?
    })
  end

  it "finds the ground and water /create finds, and sea off the tiles" do
    expected["ground"].each do |point|
      x, z = point["at"]
      sample = ground.at(x, z)
      expect(sample[:ground]).to be_within(1e-6).of(point["ground"] || described_class::EMPTY_FT), "at #{point["at"]}"
      expect(sample[:water]).to eq(point["water"]), "at #{point["at"]}"
    end
    expect(fetched).to include("https://raw.githubusercontent.com/me/w/c0ffee/places/continents/main/plates/0_0.plate")
    expect(fetched).to include("https://raw.githubusercontent.com/me/w/c0ffee/places/continents/main/placed/0_0.json")
    expect(fetched).to eq(fetched.uniq) # each file once
  end

  it "fills the tiles' slots as /create fills them, but for boulders across cascades" do
    expected["fills"].each do |fill|
      things = ground.fill(*fill["tile"])
      want = fill["things"]
      have = things.map { |t| [t[:type], t[:x], t[:z]] }
      # /create's boulders across the stream's cascades, which the bots leave out, aren't in slots.
      cascade = want.reject { |w| have.include?([w["type"], w["x"], w["z"]]) }
      expect(cascade.map { _1["type"] }.uniq - %w[boulder mossyBoulder]).to be_empty, "tile #{fill["tile"]}"
      expect(cascade.map { _1["x"] % 1 }).not_to include(0.5)
      expect(have.size + cascade.size).to eq(want.size), "tile #{fill["tile"]}"
      things.each do |t|
        w = want.find { _1["x"] == t[:x] && _1["z"] == t[:z] }
        expect(t[:yaw]).to be_within(1e-9).of(w["yaw"])
        expect(t[:footprint].keys).to eq(w["footprint"].keys)
        t[:footprint].values.flatten.zip(w["footprint"].values.flatten).each { |a, b| expect(a).to be_within(1e-9).of(b) }
        expect(t[:height]).to be_within(1e-9).of(w["height"]) if w["height"]
      end
    end
    expect(expected["fills"].sum { ground.fill(*_1["tile"]).size }).to be > 100
  end

  it "knows every biome and tree kind fill.json has" do
    table = Bot::Fill.table
    expect(table["biomes"].keys).to match_array(Bot::Fill::BIOMES)
    trees = table["biomes"].values.flat_map { _1.values.flatten }.filter_map { _1["tree"] }.uniq
    expect(trees - Bot::Fill::TREE_KINDS.keys).to be_empty
  end

  it "stands placed objects where /create stands them" do
    expected["standing"].each do |s|
      t = ground.placed_objects(0, 0).find { _1[:x] == s["at"][0] && _1[:z] == s["at"][1] }
      expect(ground.object_y(t)).to be_within(1e-6).of(s["y"]), s["type"]
    end
  end

  it "finds the slab footholds /create finds, and stands on the highest within a step" do
    expected["footholds"].each do |point|
      x, z = point["at"]
      height, = ground.stand(x, z, 100)
      expect(height).to be_within(1e-6).of([ground.at(x, z)[:ground], *point["footholds"]].max), "at #{point["at"]}"
    end
    floor = expected["footholds"].first["footholds"].first
    # Beside the floor, it steps up onto it; well under it, it stays down.
    expect(ground.stand(110, 510, floor - 2)).to eq([floor, false])
    expect(ground.stand(110, 510, floor - 10)[0]).to be < floor
  end

  it "swims in deep water" do
    lake = expected["ground"].find { _1["water"] && _1["water"] - 4.5 > _1["ground"].to_f && _1["ground"] }
    expect(ground.stand(*lake["at"])).to eq([lake["water"] - 4.5, true])
  end

  it "won't walk into a slab, a tree or an object, but will through a doorway or out of one it's in" do
    floor = expected["footholds"].first["footholds"].first
    # The wall runs along z 499 from x 100, with a doorway from x 110 to 114.
    expect(ground.enters?([105, floor, 502], [105, floor, 496])).to be(true)
    expect(ground.enters?([112, floor, 502], [112, floor, 496])).to be(false)
    tree = expected["fills"].flat_map { _1["things"] }.find { _1["footprint"]["circle"].to_f > 3 && _1["height"].nil? }
    x, z = tree["x"], tree["z"]
    y = ground.at(x, z)[:ground]
    expect(ground.enters?([x - 10, y, z], [x + 10, y, z])).to be(true)
    expect(ground.enters?([x, y, z], [x + 10, y, z])).to be(false)
    # The stump placed by hand.
    expect(ground.enters?([410, 36.75, 120], [430, 36.75, 120])).to be(true)
  end

  it "finds the cave floors /create finds, and stands on them under the ground" do
    expect(expected["caveFloors"]).not_to be_empty
    expected["caveFloors"].each do |point|
      x, z = point["at"]
      sample = ground.at(x, z)
      expect(sample[:open]).to eq(point["open"]), "at #{point["at"]}"
      expect(sample[:floors].size).to eq(point["floors"].size), "at #{point["at"]}"
      sample[:floors].zip(point["floors"]).each { |a, b| expect(a).to be_within(1e-6).of(b), "at #{point["at"]}" }
    end
    # In the domed cave, on its floor; at the tunnel's mouth, not on the ground it opens.
    expect(ground.stand(550, 430, -20)[0]).to be_within(1e-6).of(-20)
    expect(ground.stand(550, 430, 20)[0]).to be > 0
    mouth = expected["caveFloors"].find { _1["open"] }
    expect(ground.stand(*mouth["at"], mouth["ground"])[0]).to be_within(1e-6).of(mouth["floors"].max)
  end

  it "won't walk into a cave's rock, but will through its mouth and along it" do
    expect(ground.enters?([545, -20, 425], [555, -20, 435])).to be(false)
    expect(ground.enters?([550, -20, 450], [550, -20, 470])).to be(true)
    expect(ground.enters?([535, 4.7, 325], [540, -3.8, 350])).to be(false)
    expect(ground.enters?([530, 17.5, 296], [531.3, 12.1, 301.7])).to be(false)
    expect(ground.enters?([550, -20, 470], [550, -20, 450])).to be(false)
    expect(ground.enters?([520, 14, 460], [530, 14, 470])).to be(false)
  end
end
