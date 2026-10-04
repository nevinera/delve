require "rails_helper"

RSpec.describe ClassAbility, type: :model do
  let(:character_class) { create(:character_class) }

  it "is valid with all required fields" do
    expect(build(:class_ability, character_class: character_class)).to be_valid
  end

  it "requires a name" do
    ability = build(:class_ability, character_class: character_class, name: nil)
    expect(ability).not_to be_valid
    expect(ability.errors[:name]).to be_present
  end

  it "requires a position unique within its class" do
    create(:class_ability, character_class: character_class, position: 0)
    ability = build(:class_ability, character_class: character_class, position: 0)
    expect(ability).not_to be_valid
    expect(ability.errors[:position]).to be_present
  end

  it "is ordered by position on its class" do
    second = create(:class_ability, character_class: character_class, position: 1)
    first = create(:class_ability, character_class: character_class, position: 0)
    expect(character_class.class_abilities).to eq([first, second])
  end

  it "is destroyed with its class" do
    create(:class_ability, character_class: character_class)
    expect { character_class.destroy }.to change(described_class, :count).by(-1)
  end

  describe "#icon_color" do
    it "reads iconColor from the source JSON, adding a missing #" do
      expect(build(:class_ability, source_json: {"iconColor" => "ff8a3d"}).icon_color).to eq("#ff8a3d")
      expect(build(:class_ability, source_json: {"iconColor" => "#FF8A3D"}).icon_color).to eq("#FF8A3D")
    end

    it "is nil when absent or not a hex color" do
      expect(build(:class_ability, source_json: {}).icon_color).to be_nil
      expect(build(:class_ability, source_json: {"iconColor" => "red"}).icon_color).to be_nil
    end
  end

  describe "#icon_mask_url" do
    it "passes a plain URL through and refuses one that could break out of a CSS url()" do
      expect(build(:class_ability, icon_url: "/abilities/icons/slash.svg").icon_mask_url).to eq("/abilities/icons/slash.svg")
      expect(build(:class_ability, icon_url: "x.svg') ; background: url('y").icon_mask_url).to be_nil
    end
  end

  describe "#stat_summary" do
    it "lists cost, cast time, GCD, cooldown, and range" do
      ability = build(:class_ability, cost_type: "energy", cost_amount: 30.0, cast_time: 1.5,
        global_cooldown: 1.0, cooldown: 3.0, max_range: 5.0)
      expect(ability.stat_summary).to eq("30 energy · 1.5s cast · 1s GCD · 3s cooldown · 5 range")
    end

    it "calls a nil cast time instant and omits missing fields" do
      ability = build(:class_ability, cast_time: nil, global_cooldown: 0.5)
      expect(ability.stat_summary).to eq("Instant · 0.5s GCD")
    end

    it "keeps fields that share a value" do
      ability = build(:class_ability, global_cooldown: 1.5, cooldown: 1.5)
      expect(ability.stat_summary).to eq("Instant · 1.5s GCD · 1.5s cooldown")
    end
  end
end
