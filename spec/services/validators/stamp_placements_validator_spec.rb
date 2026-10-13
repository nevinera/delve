require "rails_helper"

RSpec.describe Validators::StampPlacementsValidator, type: :validator do
  let(:tent) { {"stamp" => "camp/tent", "x" => 10, "y" => 20, "rotation" => 45, "scale" => 1.5, "variant" => 0} }

  def expect_invalid(stamps, message, path)
    expect { described_class.validate!(stamps, path: "$.stamps") }
      .to raise_error(Validators::ValidationError, message) { |e| expect(e.path).to eq(path) }
  end

  it "accepts placed stamps, with only stamp, x and y required" do
    expect { described_class.validate!([tent, {"stamp" => "camp/log", "x" => 0, "y" => 0}]) }.not_to raise_error
  end

  it "raises on a stamp that doesn't name its set" do
    expect_invalid([tent.merge("stamp" => "tent")], %r{set/stamp}, "$.stamps[0].stamp")
  end

  it "raises on a missing position" do
    expect_invalid([tent.except("y")], /y is required/, "$.stamps[0].y")
  end

  it "raises on a scale of 0" do
    expect_invalid([tent.merge("scale" => 0)], /scale must be more than 0/, "$.stamps[0].scale")
  end

  it "raises on a negative variant" do
    expect_invalid([tent.merge("variant" => -1)], /variant must be at least 0/, "$.stamps[0].variant")
  end
end
