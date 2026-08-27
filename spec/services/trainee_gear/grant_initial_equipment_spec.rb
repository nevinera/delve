require "rails_helper"

RSpec.describe TraineeGear::GrantInitialEquipment do
  let(:user) { create(:user) }
  let(:handle) { create(:handle, user: user) }
  let(:character_class) do
    create(:character_class, user: user, handle: handle,
      primary_stats: ["strength"],
      secondary_stats: %w[crit_rating haste_rating mastery_rating versatility_rating stamina],
      wields: %w[sword shield])
  end
  let(:character) { create(:character, user: user, character_class: character_class) }

  it "creates a CharacterItem for every fillable equip slot" do
    expect { described_class.call(character: character) }
      .to change(character.character_items, :count).from(0).to(14)
  end

  it "equips every created item into its slot" do
    described_class.call(character: character)

    equipped = character.equipped_items.includes(:character_item).index_by(&:equipped_slot)
    expect(equipped.keys).to contain_exactly(*EquippedItem::EQUIPPED_SLOTS)
    expect(equipped["head"].character_item.name).to eq("Trainee Head")
  end

  context "with a two-handed weapon (single wield entry)" do
    let(:character_class) do
      create(:character_class, user: user, handle: handle,
        primary_stats: ["strength"],
        secondary_stats: %w[crit_rating haste_rating mastery_rating versatility_rating stamina],
        wields: ["staff"])
    end

    it "locks off_hand, so only 13 slots get an item" do
      expect { described_class.call(character: character) }
        .to change(character.character_items, :count).from(0).to(13)
      expect(character.equipped_items.pluck(:equipped_slot)).not_to include("off_hand")
    end
  end

  it "gives each item a nil provenance_zone and a synthetic zone_identifier/version" do
    described_class.call(character: character)

    item = character.character_items.find_by(identifier: "trainee-head")
    expect(item.provenance_zone).to be_nil
    expect(item.zone_identifier).to eq("trainee")
    expect(item.version).to eq("0.0")
  end

  it "marks the off_hand item as a shield with no primary stat" do
    described_class.call(character: character)

    off_hand = character.character_items.find_by(identifier: "trainee-off_hand")
    expect(off_hand.source_json["shield"]).to eq(true)
    expect(off_hand.primary_stat).to be_nil
    expect(off_hand.slot).to eq("off_hand")
  end

  it "creates valid, persisted records (insert_all bypasses model validations)" do
    described_class.call(character: character)

    character.character_items.reload.each { |item| expect(item).to be_valid }
    character.equipped_items.reload.each { |equipped_item| expect(equipped_item).to be_valid }
  end

  it "raises ClassContentNotReady when the character's class hasn't finished fetching content" do
    unfetched_class = create(:character_class, user: user, handle: handle, primary_stats: [], secondary_stats: [], wields: [])
    other_character = create(:character, user: user, character_class: unfetched_class)

    expect { described_class.call(character: other_character) }
      .to raise_error(TraineeGear::GrantInitialEquipment::ClassContentNotReady)
    expect(other_character.character_items.count).to eq(0)
  end
end
