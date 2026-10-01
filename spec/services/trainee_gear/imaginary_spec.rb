require "rails_helper"

RSpec.describe TraineeGear::Imaginary do
  let(:character_class) { create(:character_class) }

  it "builds equipped trainee items at the given elvl without saving anything" do
    gear = nil
    expect { gear = described_class.call(character_class:, elvl: 12) }.not_to change(CharacterItem, :count)
    expect(gear["head"]).to include(identifier: "trainee-head", slot: "head", elvl: 12, id: nil)
    expect(gear["head"][:stats]).to be_present
  end

  it "fills the same slots as saved trainee gear" do
    world_character = create(:world_character, character: create(:character, character_class:))
    TraineeGear::GrantInitialEquipment.call(world_character:)
    expect(described_class.call(character_class:, elvl: 0).keys)
      .to match_array(world_character.equipped_items.pluck(:equipped_slot))
  end
end
