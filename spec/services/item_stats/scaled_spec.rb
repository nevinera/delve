require "rails_helper"

RSpec.describe ItemStats::Scaled do
  describe ".call" do
    it "leaves values unchanged at ee=0" do
      result = described_class.call(raw_stats: {strength: 100.0, stamina: 50.0}, ee: 0)
      expect(result[:strength]).to be_within(0.01).of(100.0)
      expect(result[:stamina]).to be_within(0.01).of(50.0)
    end

    it "halves values at ee=-10" do
      result = described_class.call(raw_stats: {strength: 100.0}, ee: -10)
      expect(result[:strength]).to be_within(0.01).of(50.0)
    end

    it "zeroes everything out at ee=-20" do
      result = described_class.call(raw_stats: {strength: 100.0, crit_rating: 40.0}, ee: -20)
      expect(result[:strength]).to eq(0.0)
      expect(result[:crit_rating]).to eq(0.0)
    end

    it "does not mutate the input hash" do
      raw = {strength: 100.0}
      described_class.call(raw_stats: raw, ee: -10)
      expect(raw[:strength]).to eq(100.0)
    end
  end
end
