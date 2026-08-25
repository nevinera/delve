require "rails_helper"

RSpec.describe ItemStats::Raw do
  def item(**attrs)
    build(:character_item, **attrs)
  end

  describe ".call" do
    it "computes a fully-itemized head piece (1.5x factor)" do
      stats = described_class.call(character_item: item(slot: "head", primary_stat: "strength",
        secondary_stats: %w[crit_rating haste_rating stamina]))

      expect(stats[:strength]).to be_within(0.01).of(22.5)
      expect(stats[:crit_rating]).to be_within(0.01).of(15)
      expect(stats[:haste_rating]).to be_within(0.01).of(15)
      # itemized stamina (15) + base armor-slot stamina (15)
      expect(stats[:stamina]).to be_within(0.01).of(30)
    end

    it "grants base stamina on armor slots even without itemized stamina" do
      stats = described_class.call(character_item: item(slot: "waist", primary_stat: "strength", secondary_stats: %w[haste_rating]))
      expect(stats[:stamina]).to be_within(0.01).of(10)
    end

    it "does not grant base stamina on rings, necks, or weapons" do
      %w[ring neck main_hand].each do |slot|
        stats = described_class.call(character_item: item(slot: slot, primary_stat: nil, secondary_stats: []))
        expect(stats[:stamina]).to eq(0.0), "expected no base stamina for slot #{slot}"
      end
    end

    it "applies the two-hander's 4x factor" do
      stats = described_class.call(character_item: item(slot: "two_hand", primary_stat: "strength", secondary_stats: %w[stamina crit_rating haste_rating]))
      expect(stats[:strength]).to be_within(0.01).of(60)
    end

    context "redistribution when stats are omitted" do
      it "increases remaining secondaries by 26.7% when only the primary is missing (chest, 3/3 secondaries)" do
        stats = described_class.call(character_item: item(slot: "chest", primary_stat: nil,
          secondary_stats: %w[crit_rating haste_rating versatility_rating]))

        # base 10 * 1.5 factor * (1 + 0.2667) ~= 20.0
        expect(stats[:crit_rating]).to be_within(0.05).of(19.0)
        expect(stats[:haste_rating]).to be_within(0.05).of(19.0)
        expect(stats[:versatility_rating]).to be_within(0.05).of(19.0)
      end

      it "increases remaining secondaries by 70% when the primary and one secondary are missing (chest, 2/3 secondaries)" do
        stats = described_class.call(character_item: item(slot: "chest", primary_stat: nil, secondary_stats: %w[crit_rating haste_rating]))

        # base 10 * 1.5 factor * 1.7 = 25.5
        expect(stats[:crit_rating]).to be_within(0.05).of(25.5)
        expect(stats[:haste_rating]).to be_within(0.05).of(25.5)
      end

      it "increases the primary when a secondary is missing" do
        stats = described_class.call(character_item: item(slot: "waist", primary_stat: "strength", secondary_stats: %w[haste_rating]))

        # missing 1 of 2 secondaries: 0.6 bonus / 2 filled stats (primary + 1 secondary) = 0.3 each
        expect(stats[:strength]).to be_within(0.05).of(15 * 1.3)
        expect(stats[:haste_rating]).to be_within(0.05).of(10 * 1.3)
      end
    end

    context "rings and necks" do
      it "never has a primary, and its absence doesn't count as 'missing'" do
        stats = described_class.call(character_item: item(slot: "ring", primary_stat: nil, secondary_stats: %w[crit_rating haste_rating]))
        expect(stats[:crit_rating]).to be_within(0.01).of(10)
        expect(stats[:haste_rating]).to be_within(0.01).of(10)
      end
    end

    context "shields" do
      def shield_item(**attrs)
        build(:character_item, slot: "off_hand", primary_stat: nil,
          source_json: {"identifier" => "shield", "name" => "Shield", "slot" => "off_hand", "shield" => true},
          **attrs)
      end

      it "grants the fixed 2.5x Defence Rating instead of a primary" do
        stats = described_class.call(character_item: shield_item(secondary_stats: []))
        # 2.5 * 15 * 2.0 factor
        expect(stats[:defence_rating]).to be_within(0.01).of(75)
      end

      it "adds itemized secondaries and defence_rating on top of the fixed component" do
        stats = described_class.call(character_item: shield_item(secondary_stats: %w[defence_rating stamina mastery_rating]))
        expect(stats[:defence_rating]).to be_within(0.01).of(75 + 20)
        expect(stats[:stamina]).to be_within(0.01).of(20)
        expect(stats[:mastery_rating]).to be_within(0.01).of(20)
      end

      it "does not count the fixed component as a 'filled' stat for redistribution" do
        stats = described_class.call(character_item: shield_item(secondary_stats: %w[stamina]))
        # only 1 of 3 secondaries filled: missing 2 * 0.6 = 1.2 bonus / 1 filled = 120%
        expect(stats[:stamina]).to be_within(0.05).of(10 * 2.0 * 2.2)
      end
    end

    it "returns an empty hash for a completely unitemized item" do
      stats = described_class.call(character_item: item(slot: "chest", primary_stat: nil, secondary_stats: []))
      expect(stats[:strength]).to eq(0.0)
      expect(stats[:crit_rating]).to eq(0.0)
      # base armor stamina still applies even with nothing itemized
      expect(stats[:stamina]).to be_within(0.01).of(15)
    end
  end
end
