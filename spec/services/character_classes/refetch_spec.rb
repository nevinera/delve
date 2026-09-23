require "rails_helper"

RSpec.describe CharacterClasses::Refetch do
  let(:content) do
    {
      "name" => "Puncher", "colors" => {"major" => "8B4513", "minor" => "F4A460"},
      "primaryStats" => ["strength"],
      "secondaryStats" => %w[stamina crit_rating haste_rating mastery_rating versatility_rating],
      "wields" => %w[dagger dagger],
      "resources" => [{"name" => "energy", "color" => "FFDD00", "max" => 100, "defaultValue" => 100, "isFluid" => true, "displayType" => "primary"}],
      "powers" => [{"name" => "Punch", "castTime" => nil, "globalCooldown" => 0.5,
                    "effects" => [{"type" => "harm", "affects" => "bTarget", "amount" => 10, "range" => 5}]}]
    }.to_json
  end
  let!(:puncher) { create(:character_class, identifier: "puncher", location: "https://example.com/puncher.json") }
  let!(:kicker) { create(:character_class, identifier: "kicker", location: "https://example.com/kicker.json") }

  before do
    stub_request(:get, puncher.location).to_return(body: content)
    stub_request(:get, kicker.location).to_return(body: content)
  end

  it "re-extracts abilities for every class" do
    results = described_class.call
    expect(results).to eq(kicker => nil, puncher => nil)
    expect(puncher.class_abilities.map(&:name)).to eq(["Punch"])
    expect(kicker.class_abilities.map(&:name)).to eq(["Punch"])
  end

  it "limits to one class by identifier" do
    expect(described_class.call(identifier: "puncher").keys).to eq([puncher])
    expect(kicker.class_abilities).to be_empty
  end

  it "reports a fetch failure and continues" do
    stub_request(:get, kicker.location).to_return(status: 404)
    results = described_class.call
    expect(results[kicker]).to match(/HTTP 404/)
    expect(results[puncher]).to be_nil
  end

  it "reports a validation failure" do
    stub_request(:get, kicker.location).to_return(body: "not json")
    expect(described_class.call[kicker]).to match(/invalid JSON/)
  end
end
