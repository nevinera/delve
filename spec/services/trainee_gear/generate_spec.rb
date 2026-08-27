require "rails_helper"

RSpec.describe TraineeGear::Generate do
  let(:secondary_stats) { %w[crit_rating haste_rating mastery_rating versatility_rating stamina] }

  describe "single primary stat" do
    it "puts the one primary stat on every primary-bearing slot" do
      result = described_class.call(primary_stats: ["strength"], secondary_stats: secondary_stats, wields: ["staff"])

      %w[main_hand head shoulders back chest wrists hands waist legs feet].each do |slot|
        expect(result[slot].primary_stat).to eq("strength")
      end
    end

    it "gives neck and rings no primary stat" do
      result = described_class.call(primary_stats: ["strength"], secondary_stats: secondary_stats, wields: ["staff"])

      expect(result["neck"].primary_stat).to be_nil
      expect(result["ring_1"].primary_stat).to be_nil
      expect(result["ring_2"].primary_stat).to be_nil
    end
  end

  describe "two primary stats" do
    it "matches the docs/stats.md allocation table" do
      result = described_class.call(primary_stats: %w[strength intellect], secondary_stats: secondary_stats, wields: ["staff"])

      expect(result["main_hand"].primary_stat).to eq("strength")
      expect(result["head"].primary_stat).to eq("strength")
      expect(result["shoulders"].primary_stat).to eq("intellect")
      expect(result["back"].primary_stat).to eq("strength")
      expect(result["chest"].primary_stat).to eq("intellect")
      expect(result["wrists"].primary_stat).to eq("strength")
      expect(result["hands"].primary_stat).to eq("intellect")
      expect(result["waist"].primary_stat).to eq("strength")
      expect(result["legs"].primary_stat).to eq("intellect")
      expect(result["feet"].primary_stat).to eq("strength")
    end
  end

  describe "three primary stats" do
    it "matches the docs/stats.md allocation table" do
      result = described_class.call(
        primary_stats: %w[strength agility intellect], secondary_stats: secondary_stats, wields: ["staff"]
      )

      expect(result["main_hand"].primary_stat).to eq("strength")
      expect(result["head"].primary_stat).to eq("agility")
      expect(result["shoulders"].primary_stat).to eq("agility")
      expect(result["back"].primary_stat).to eq("strength")
      expect(result["chest"].primary_stat).to eq("intellect")
      expect(result["wrists"].primary_stat).to eq("agility")
      expect(result["hands"].primary_stat).to eq("strength")
      expect(result["waist"].primary_stat).to eq("agility")
      expect(result["legs"].primary_stat).to eq("strength")
      expect(result["feet"].primary_stat).to eq("intellect")
    end
  end

  describe "secondary stats" do
    it "matches the docs/stats.md coverage table" do
      result = described_class.call(primary_stats: ["strength"], secondary_stats: secondary_stats, wields: ["staff"])

      v, w, x, y, z = secondary_stats
      expect(result["head"].secondary_stats).to eq([v, w, x])
      expect(result["neck"].secondary_stats).to eq([v, w, x])
      expect(result["shoulders"].secondary_stats).to eq([w, y])
      expect(result["back"].secondary_stats).to eq([v, w])
      expect(result["chest"].secondary_stats).to eq([v, w, x])
      expect(result["wrists"].secondary_stats).to eq([v, y])
      expect(result["hands"].secondary_stats).to eq([v, z])
      expect(result["ring_1"].secondary_stats).to eq([v, x])
      expect(result["ring_2"].secondary_stats).to eq([w, y])
      expect(result["waist"].secondary_stats).to eq([v, y])
      expect(result["legs"].secondary_stats).to eq([v, w, x])
      expect(result["feet"].secondary_stats).to eq([v, z])
      expect(result["main_hand"].secondary_stats).to eq([v, w, x])
    end
  end

  describe "wields" do
    it "locks off_hand and puts a two_hand item in main_hand for a single wield entry" do
      result = described_class.call(primary_stats: ["strength"], secondary_stats: secondary_stats, wields: ["staff"])

      expect(result).not_to have_key("off_hand")
      expect(result["main_hand"].slot).to eq("two_hand")
      expect(result["main_hand"].wield).to eq("staff")
    end

    it "puts one-handed items in both hands for two wield entries" do
      result = described_class.call(
        primary_stats: ["strength"], secondary_stats: secondary_stats, wields: %w[dagger dagger]
      )

      expect(result["main_hand"].slot).to eq("one_hand")
      expect(result["main_hand"].wield).to eq("dagger")
      expect(result["off_hand"].slot).to eq("off_hand")
      expect(result["off_hand"].wield).to eq("dagger")
    end

    it "marks the off-hand item as a shield when wielded, with no primary stat" do
      result = described_class.call(
        primary_stats: ["strength"], secondary_stats: secondary_stats, wields: %w[sword shield]
      )

      expect(result["off_hand"].shield).to be true
      expect(result["off_hand"].primary_stat).to be_nil
      expect(result["main_hand"].shield).to be false
    end

    it "names weapon items after the wielded type, not the equip slot" do
      result = described_class.call(
        primary_stats: ["strength"], secondary_stats: secondary_stats, wields: %w[sword shield]
      )

      expect(result["main_hand"].name).to eq("Trainee Sword")
      expect(result["off_hand"].name).to eq("Trainee Shield")
    end
  end

  it "returns an Item struct with a name for every slot" do
    result = described_class.call(primary_stats: ["strength"], secondary_stats: secondary_stats, wields: ["staff"])

    expect(result["head"].name).to eq("Trainee Helm")
    expect(result.keys).to contain_exactly(*(EquippedItem::EQUIPPED_SLOTS - ["off_hand"]))
  end

  it "gives the two rings distinct flavor names" do
    result = described_class.call(primary_stats: ["strength"], secondary_stats: secondary_stats, wields: ["staff"])

    expect(result["ring_1"].name).to eq("Trainee Ring of Preparedness")
    expect(result["ring_2"].name).to eq("Trainee Ring of Possibility")
    expect(result["neck"].name).to eq("Trainee Chain")
  end
end
