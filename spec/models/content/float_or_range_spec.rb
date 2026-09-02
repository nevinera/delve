require "rails_helper"

RSpec.describe Content::FloatOrRange do
  describe ".from_value" do
    it "returns nil for nil" do
      expect(described_class.from_value(nil)).to be_nil
    end

    it "builds a min==max range from a scalar" do
      range = described_class.from_value(20.0)
      expect(range.min).to eq(20.0)
      expect(range.max).to eq(20.0)
      expect(range.ranged?).to eq(false)
    end

    it "builds a min/max range from a two-element array" do
      range = described_class.from_value([5.0, 10.0])
      expect(range.min).to eq(5.0)
      expect(range.max).to eq(10.0)
      expect(range.ranged?).to eq(true)
    end
  end

  describe "#to_value" do
    it "collapses to a scalar when min == max" do
      expect(described_class.new(min: 3.0, max: 3.0).to_value).to eq(3.0)
    end

    it "stays a [min, max] array when they differ" do
      expect(described_class.new(min: 3.0, max: 5.0).to_value).to eq([3.0, 5.0])
    end
  end
end
