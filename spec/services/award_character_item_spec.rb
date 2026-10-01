require "rails_helper"

RSpec.describe AwardCharacterItem do
  let(:zone) { create(:zone, identifier: "darkwood") }
  let(:world_character) { create(:world_character, world: zone.world_version.world, world_version: zone.world_version) }
  let(:definition) do
    {
      "identifier" => "sword-of-doom",
      "name" => "Sword of Doom",
      "slot" => "main_hand",
      "elvl" => 584,
      "weaponType" => "sword",
      "primary" => "strength",
      "secondaries" => ["haste_rating", "crit_rating"]
    }
  end
  let(:source_data) do
    definition.merge("zone" => {"database_id" => zone.id.to_s, "identifier" => "darkwood", "version" => "anything"})
  end
  let(:item_version) { ItemDefinition.version(definition) }

  def call(data = source_data, upgrade_only: false)
    described_class.call(world_character:, source_data: data, upgrade_only:)
  end

  it "creates the item on the world character, versioned by its definition" do
    item = call
    expect(item).to be_persisted
    expect(item).to have_attributes(
      world_character:, identifier: "sword-of-doom", zone_identifier: "darkwood", version: item_version,
      name: "Sword of Doom", slot: "main_hand", elvl: 584,
      primary_stat: "strength", secondary_stats: ["haste_rating", "crit_rating"]
    )
  end

  it "stores the normalized definition, without the zone ref or routing params" do
    item = call(source_data.merge("world_character_id" => "7", "controller" => "x"))
    expect(item.source_json).to eq(ItemDefinition.normalize(definition))
  end

  it "says so when the world character already holds this definition" do
    call
    expect(call).to eq(:already_owned_this_version)
    expect(CharacterItem.count).to eq(1)
  end

  it "treats a changed definition as a new version of the same item" do
    call
    result = call(source_data.merge("elvl" => 600))
    expect(result).to match([be_a(CharacterItem), :already_owned_other_version])
    expect(world_character.character_items.count).to eq(2)
  end

  it "doesn't count the same identifier from another zone as an older version" do
    other_zone = create(:zone, identifier: "cave", world_version: zone.world_version)
    call(source_data.merge("zone" => {"database_id" => other_zone.id.to_s, "identifier" => "cave"}))
    expect(call).to be_a(CharacterItem)
  end

  describe "upgrade_only" do
    it "refuses when the world character holds no older version" do
      expect(call(upgrade_only: true)).to eq(:not_an_upgrade)
      expect(CharacterItem.count).to eq(0)
    end

    it "awards when they hold an older version" do
      call(source_data.merge("elvl" => 500))
      expect(call(upgrade_only: true)).to match([be_a(CharacterItem), :already_owned_other_version])
    end
  end

  it "refuses a zone outside the world character's current version" do
    other = create(:zone, identifier: "darkwood")
    data = source_data.merge("zone" => {"database_id" => other.id.to_s, "identifier" => "darkwood"})
    expect { call(data) }.to raise_error(AwardCharacterItem::ZoneMismatch)
  end

  it "refuses a zone identifier that doesn't match the zone" do
    data = source_data.merge("zone" => {"database_id" => zone.id.to_s, "identifier" => "cave"})
    expect { call(data) }.to raise_error(AwardCharacterItem::ZoneMismatch)
  end

  it "refuses a world character that hasn't entered a version" do
    world_character.update!(world_version: nil)
    expect { call }.to raise_error(AwardCharacterItem::ZoneMismatch)
  end

  it "requires the definition's core fields" do
    expect { call(source_data.except("slot")) }.to raise_error(AwardCharacterItem::MissingField)
  end
end
