require "rails_helper"

RSpec.describe ContentVersion do
  it "orders numerically, not lexically" do
    expect(described_class.parse("1.10")).to be > described_class.parse("1.9")
    expect(described_class.parse("2.0")).to be > described_class.parse("1.99")
  end

  it "treats equal versions as equal" do
    expect(described_class.parse("1.5")).to eq(described_class.parse("1.5"))
  end

  it "round-trips through to_s" do
    expect(described_class.parse("12.34").to_s).to eq("12.34")
  end

  it "rejects malformed versions" do
    expect { described_class.parse("1") }.to raise_error(ArgumentError)
    expect { described_class.parse("1.2.3") }.to raise_error(ArgumentError)
  end
end
