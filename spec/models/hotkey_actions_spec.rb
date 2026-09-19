require "rails_helper"

RSpec.describe HotkeyActions do
  it "lists unique action ids" do
    expect(described_class::IDS).to eq(described_class::IDS.uniq)
    expect(described_class::IDS).to include("move_forward", "ability_1", "ability_10", "target_next")
  end

  it "gives every action a label" do
    expect(described_class::ALL).to all(include("id" => be_present, "label" => be_present))
  end

  it "knows its own ids and rejects others" do
    expect(described_class.known?("ability_3")).to be(true)
    expect(described_class.known?("ability_11")).to be(false)
  end
end
