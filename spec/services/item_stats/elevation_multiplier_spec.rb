require "rails_helper"

RSpec.describe ItemStats::ElevationMultiplier do
  describe ".for" do
    it "returns 1.0 at ee=0" do
      expect(described_class.for(0)).to be_within(0.001).of(1.0)
    end

    it "returns 0.5 at ee=-10" do
      expect(described_class.for(-10)).to be_within(0.001).of(0.5)
    end

    it "returns 1.5 at ee=10" do
      expect(described_class.for(10)).to be_within(0.001).of(1.5)
    end

    it "returns 0.0 at ee=-20" do
      expect(described_class.for(-20)).to be_within(0.001).of(0.0)
    end

    it "returns 2.0 at ee=20" do
      expect(described_class.for(20)).to be_within(0.001).of(2.0)
    end

    it "returns 0.0 below ee=-20" do
      expect(described_class.for(-30)).to eq(0.0)
    end

    it "matches the documented value at ee=-15" do
      expect(described_class.for(-15)).to be_within(0.01).of(0.16)
    end

    it "matches the documented value at ee=15" do
      expect(described_class.for(15)).to be_within(0.01).of(1.77)
    end

    it "is monotonically increasing" do
      values = (-20..20).step(1).map { |ee| described_class.for(ee) }
      expect(values).to eq(values.sort)
    end
  end
end
