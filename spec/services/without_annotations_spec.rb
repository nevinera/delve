require "rails_helper"

RSpec.describe WithoutAnnotations do
  let(:notes) { {"plan" => "Notes."} }
  let(:zone) do
    {
      "name" => "Gnawdeep", "annotations" => notes,
      "unitTypes" => {"goblin" => {"name" => "Goblin", "annotations" => notes}},
      "maps" => [{
        "identifier" => "hall", "annotations" => notes,
        "places" => [{"identifier" => "throne", "annotations" => notes}],
        "units" => [{"identifier" => "grutt", "annotations" => notes}],
        "interactables" => [{"identifier" => "cell-door", "annotations" => notes}],
        "ncus" => [{"identifier" => "maren", "annotations" => notes,
                    "dialogue" => {"nodes" => {"annotations" => {"text" => "A node named annotations."}}}}]
      }]
    }
  end

  it "drops annotations at every level they're allowed" do
    stripped = described_class.zone(zone)
    expect(stripped).to eq(
      "name" => "Gnawdeep",
      "unitTypes" => {"goblin" => {"name" => "Goblin"}},
      "maps" => [{
        "identifier" => "hall",
        "places" => [{"identifier" => "throne"}],
        "units" => [{"identifier" => "grutt"}],
        "interactables" => [{"identifier" => "cell-door"}],
        "ncus" => [{"identifier" => "maren", "dialogue" => {"nodes" => {"annotations" => {"text" => "A node named annotations."}}}}]
      }]
    )
  end

  it "leaves the original alone" do
    described_class.zone(zone)
    expect(zone["maps"][0]["units"][0]).to include("annotations" => notes)
  end

  it "passes through data that isn't a zone object" do
    expect(described_class.zone(nil)).to be_nil
  end
end
