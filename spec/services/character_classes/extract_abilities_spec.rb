require "rails_helper"

RSpec.describe CharacterClasses::ExtractAbilities do
  let(:character_class) do
    create(:character_class, location: "https://raw.githubusercontent.com/example/content/main/classes/puncher.full.json")
  end
  let(:punch) do
    {
      "name" => "Punch",
      "description" => "Hits hard.",
      "iconURL" => "../graphics/icons/punch.svg",
      "castTime" => nil,
      "globalCooldown" => 0.5,
      "cooldown" => 3.0,
      "maxRange" => 5.0,
      "costType" => "energy",
      "costAmount" => 30,
      "effects" => [{"type" => "harm", "affects" => "bTarget", "amount" => [89.0, 140.0], "range" => 5.0}]
    }
  end
  let(:heal) { {"name" => "Recover", "iconURL" => ":heal:", "castTime" => 1.5, "globalCooldown" => 1.5} }
  let(:data) { {"name" => "Puncher", "powers" => [punch, heal]} }

  def extract
    described_class.call(character_class: character_class, data: data)
    character_class.class_abilities.reload
  end

  it "creates one ability per power, in order" do
    expect(extract.map { |a| [a.position, a.name] }).to eq([[0, "Punch"], [1, "Recover"]])
  end

  it "breaks out the ability's scalar fields" do
    ability = extract.first
    expect(ability).to have_attributes(
      description: "Hits hard.", cast_time: nil, global_cooldown: 0.5, cooldown: 3.0,
      max_range: 5.0, cost_type: "energy", cost_amount: 30.0
    )
  end

  it "keeps the raw power as source_json" do
    expect(extract.first.source_json).to eq(punch)
  end

  it "resolves icon URLs" do
    expect(extract.map(&:icon_url)).to eq([
      "https://raw.githubusercontent.com/example/content/main/graphics/icons/punch.svg",
      "/abilities/icons/heal.svg"
    ])
  end

  it "replaces previously extracted abilities" do
    create(:class_ability, character_class: character_class, position: 0, name: "Old")
    expect(extract.map(&:name)).to eq(%w[Punch Recover])
  end

  context "when the class has no powers" do
    let(:data) { {"name" => "Puncher"} }

    it "creates no abilities" do
      expect(extract).to be_empty
    end
  end
end
