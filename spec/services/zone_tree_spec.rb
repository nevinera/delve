require "rails_helper"

RSpec.describe ZoneTree do
  def tree(*relative_paths) = described_class.new(relative_paths.map { |path| "zones/#{path}" })

  it "finds top-level zones and the maps directly inside them" do
    zones = tree("goblin-cave/goblin-cave.json", "goblin-cave/gc1-entrance/gc1-entrance.json")

    expect(zones.zone_keys).to eq(["goblin-cave"])
    expect(zones.map_keys).to eq(["goblin-cave/gc1-entrance"])
  end

  it "finds zones nested under a grouping folder, and their maps" do
    zones = tree("small/forest/forest.json", "small/forest/glade/glade.json", "small/cave/cave.json")

    expect(zones.zone_keys).to eq(["small/cave", "small/forest"])
    expect(zones.map_keys).to eq(["small/forest/glade"])
  end

  it "ignores companion files, images, and json not named after its directory" do
    zones = tree(
      "goblin-cave/goblin-cave.json",
      "goblin-cave/goblin-cave.full.json",
      "goblin-cave/goblin-cave.layout.json",
      "goblin-cave/gc1/gc1.full.json",
      "goblin-cave/gc1/gc1.webp",
      "goblin-cave/notes.json",
      "stray.json"
    )

    expect(zones.zone_keys).to eq(["goblin-cave"])
    expect(zones.map_keys).to eq([])
  end
end
