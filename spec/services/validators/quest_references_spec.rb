require "rails_helper"

RSpec.describe Validators::QuestReferences do
  let(:zones) do
    {
      "goblin-cave" => {
        "unitTypes" => {"rat" => {}},
        "items" => {"rusty-dagger" => {}},
        "maps" => [
          {"identifier" => "entrance", "ncus" => [{"identifier" => "grizzle"}], "units" => [{"identifier" => "rat-king"}]},
          {"identifier" => "depths", "interactables" => [{"identifier" => "snare-1"}, {"identifier" => "snare-2"}]}
        ]
      }
    }
  end
  let(:quest) do
    {
      "offeredBy" => {"zone" => "goblin-cave", "ncu" => "grizzle"},
      "turnIn" => {"zone" => "goblin-cave", "ncu" => "grizzle"},
      "objectives" => [
        {"type" => "kill", "zone" => "goblin-cave", "unitType" => "rat", "map" => "depths"},
        {"type" => "kill", "zone" => "goblin-cave", "unit" => "rat-king", "map" => "entrance"},
        {"type" => "talk", "zone" => "goblin-cave", "ncu" => "grizzle"},
        {"type" => "talk", "zone" => "goblin-cave", "ncu" => "grizzle", "map" => "entrance"},
        {"type" => "reach", "zone" => "goblin-cave", "map" => "depths"},
        {"type" => "reach", "zone" => "goblin-cave"},
        {"type" => "use", "zone" => "goblin-cave", "interactables" => ["snare-1", "snare-2"]},
        {"type" => "use", "zone" => "goblin-cave", "map" => "depths", "interactables" => ["snare-1"]}
      ],
      "rewards" => [{"zone" => "goblin-cave", "item" => "rusty-dagger"}]
    }
  end

  def validate!(q = quest) = described_class.validate!([q], zones)

  def expect_invalid(message, q)
    expect { validate!(q) }.to raise_error(Validators::ValidationError, message)
  end

  def with_objective(objective) = quest.merge("objectives" => [objective])

  it "accepts references that resolve" do
    expect { validate! }.not_to raise_error
  end

  it "rejects an unknown zone" do
    expect_invalid(/unknown zone "nowhere".*\$\[0\]\.offeredBy/, quest.merge("offeredBy" => {"zone" => "nowhere", "ncu" => "grizzle"}))
  end

  it "rejects an unknown NCU" do
    expect_invalid(/no NCU "nobody".*\$\[0\]\.turnIn/, quest.merge("turnIn" => {"zone" => "goblin-cave", "ncu" => "nobody"}))
  end

  it "rejects a talk objective's unknown NCU" do
    expect_invalid(/no NCU "nobody".*objectives\[0\]/, with_objective("type" => "talk", "zone" => "goblin-cave", "ncu" => "nobody"))
  end

  it "rejects a talk objective's NCU that isn't on its map" do
    expect_invalid(/no NCU "grizzle" on map "depths"/, with_objective("type" => "talk", "zone" => "goblin-cave", "ncu" => "grizzle", "map" => "depths"))
  end

  it "rejects a zone-only reach objective's unknown zone" do
    expect_invalid(/unknown zone "nowhere"/, with_objective("type" => "reach", "zone" => "nowhere"))
  end

  it "rejects an unknown map" do
    expect_invalid(/no map "attic"/, with_objective("type" => "reach", "zone" => "goblin-cave", "map" => "attic"))
  end

  it "rejects an unknown unit type" do
    expect_invalid(/no unit type "bat"/, with_objective("type" => "kill", "zone" => "goblin-cave", "unitType" => "bat"))
  end

  it "rejects an unknown unit" do
    expect_invalid(/no unit "rat-queen"/, with_objective("type" => "kill", "zone" => "goblin-cave", "unit" => "rat-queen"))
  end

  it "rejects a unit that isn't on the objective's map" do
    expect_invalid(/no unit "rat-king" on map "depths"/,
      with_objective("type" => "kill", "zone" => "goblin-cave", "unit" => "rat-king", "map" => "depths"))
  end

  it "rejects a use objective's unknown interactable, or one off its map" do
    expect_invalid(/no interactable "snare-9".*interactables\[1\]/, with_objective("type" => "use", "zone" => "goblin-cave", "interactables" => ["snare-1", "snare-9"]))
    expect_invalid(/no interactable "snare-1" on map "entrance"/, with_objective("type" => "use", "zone" => "goblin-cave", "map" => "entrance", "interactables" => ["snare-1"]))
  end

  it "rejects an unknown reward item" do
    expect_invalid(/no item "gold".*rewards\[0\]/, quest.merge("rewards" => [{"zone" => "goblin-cave", "item" => "gold"}]))
  end
end
