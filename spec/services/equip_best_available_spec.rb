require "rails_helper"

RSpec.describe EquipBestAvailable do
  let(:world_character) { create(:world_character) }
  let(:world) { world_character.world }
  let(:everything) { ProvenanceRestrictions.new(layers: [], own_world_key: world.key) }

  def item(name, slot: "head", elvl: 100, **attrs) = create(:character_item, world_character:, name:, slot:, elvl:, **attrs)

  def equipped = world_character.equipped_items.reload.to_h { |e| [e.equipped_slot, e.character_item.name] }

  def call(restrictions = everything) = described_class.call(world_character:, restrictions:)

  it "equips the highest elvl item in a slot" do
    item("Low", elvl: 10)
    item("High", elvl: 90)
    call
    expect(equipped).to eq("head" => "High")
  end

  it "breaks ties alphabetically by name" do
    item("Beta")
    item("Alpha")
    call
    expect(equipped).to eq("head" => "Alpha")
  end

  it "puts the two best rings in the two ring slots" do
    item("Ring A", slot: "ring", elvl: 50)
    item("Ring B", slot: "ring", elvl: 70)
    item("Ring C", slot: "ring", elvl: 60)
    call
    expect(equipped).to eq("ring_1" => "Ring B", "ring_2" => "Ring C")
  end

  it "skips disallowed items and empties slots with nothing allowed" do
    foreign = create(:world_version, world: create(:world))
    other = item("Foreign", elvl: 99, world_version: foreign)
    create(:equipped_item, world_character:, character_item: other, equipped_slot: "head")
    item("Local Chest", slot: "chest")
    call(ProvenanceRestrictions.new(layers: [{"worlds" => []}], own_world_key: world.key))
    expect(equipped).to eq("chest" => "Local Chest")
  end

  it "fills hands from one_hand items" do
    item("Sword", slot: "one_hand", elvl: 80)
    item("Dagger", slot: "one_hand", elvl: 70)
    call
    expect(equipped).to eq("main_hand" => "Sword", "off_hand" => "Dagger")
  end
end
