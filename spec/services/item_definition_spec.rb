require "rails_helper"

RSpec.describe ItemDefinition do
  let(:definition) { {"identifier" => "sword", "name" => "Sword", "slot" => "main_hand", "elvl" => 5} }

  it "ignores fields the game server doesn't send" do
    expect(described_class.version(definition.merge("icon_url" => "x.png"))).to eq(described_class.version(definition))
  end

  it "ignores empty optional fields, as the game server omits them" do
    padded = definition.merge("shield" => false, "weaponType" => nil, "description" => "", "secondaries" => [])
    expect(described_class.version(padded)).to eq(described_class.version(definition))
  end

  it "ignores the order of secondaries" do
    a = definition.merge("secondaries" => ["crit_rating", "haste_rating"])
    b = definition.merge("secondaries" => ["haste_rating", "crit_rating"])
    expect(described_class.version(a)).to eq(described_class.version(b))
  end

  it "changes when the definition does" do
    expect(described_class.version(definition.merge("elvl" => 6))).not_to eq(described_class.version(definition))
  end

  it "keeps elvl 0" do
    expect(described_class.normalize(definition.merge("elvl" => 0))).to include("elvl" => 0)
  end
end
