require "rails_helper"

RSpec.describe DisallowedEquipment do
  let(:version) { published_world }
  let(:world) { version.world }
  let(:world_character) { create(:world_character, world:, world_version: version) }
  let(:foreign_version) { create(:world_version, world: create(:world)) }

  def wear(name, slot: "head", **attrs)
    item = create(:character_item, world_character:, name:, slot:, **attrs)
    create(:equipped_item, world_character:, character_item: item, equipped_slot: slot)
    item
  end

  def call = described_class.call(world_character:, world:)

  it "lists equipped items from other worlds, since a world allows only its own by default" do
    wear("Own", slot: "head", world_version: version)
    foreign = wear("Foreign", slot: "chest", world_version: foreign_version)
    expect(call).to eq([foreign])
  end

  it "allows trainee gear" do
    wear("Trainee", world_version: nil)
    expect(call).to be_empty
  end

  it "ignores unequipped items" do
    create(:character_item, world_character:, world_version: foreign_version)
    expect(call).to be_empty
  end

  it "is empty when the world has no released version" do
    version.update!(state: :unreleased)
    wear("Foreign", world_version: foreign_version)
    expect(call).to be_empty
  end
end
