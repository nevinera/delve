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
end
