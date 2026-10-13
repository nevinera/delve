require "rails_helper"

RSpec.describe Validators::StampsValidator, type: :validator do
  let(:camp) do
    {
      "name" => "Camp", "imageUrl" => "../../graphics/stamps/camp.png",
      "license" => "CC-BY-SA-4.0", "attribution" => "Tents by Someone",
      "stamps" => {
        "tent" => {"name" => "Tent", "feetWidth" => 12, "frames" => [{"x" => 0, "y" => 0, "width" => 256, "height" => 256}]},
        "pond" => {"feetWidth" => 20}
      }
    }
  end

  def expect_invalid(sets, message, path)
    expect { described_class.validate!(sets, path: "$.stamps") }
      .to raise_error(Validators::ValidationError, message) { |e| expect(e.path).to eq(path) }
  end

  it "accepts sets of stamps, with frames optional" do
    expect { described_class.validate!({"camp" => camp}) }.not_to raise_error
  end

  it "raises on a set key that isn't a slug" do
    expect_invalid({"Camp Set" => camp}, /lowercase letters/, "$.stamps.Camp Set")
  end

  it "raises on a set with no image" do
    expect_invalid({"camp" => camp.except("imageUrl")}, /imageUrl is required/, "$.stamps.camp.imageUrl")
  end

  it "raises on a stamp without a positive feetWidth" do
    stamps = camp["stamps"].merge("tent" => {"feetWidth" => 0})
    expect_invalid({"camp" => camp.merge("stamps" => stamps)}, /feetWidth must be more than 0/, "$.stamps.camp.stamps.tent.feetWidth")
  end

  it "raises on a frame without a positive size" do
    stamps = camp["stamps"].merge("tent" => {"feetWidth" => 12, "frames" => [{"x" => 0, "y" => 0, "width" => 0, "height" => 5}]})
    expect_invalid({"camp" => camp.merge("stamps" => stamps)}, /width must be positive/, "$.stamps.camp.stamps.tent.frames[0].width")
  end

  it "raises on an empty frames list" do
    stamps = camp["stamps"].merge("tent" => {"feetWidth" => 12, "frames" => []})
    expect_invalid({"camp" => camp.merge("stamps" => stamps)}, /at least 1/, "$.stamps.camp.stamps.tent.frames")
  end

  it "raises on a set with no license" do
    expect_invalid({"camp" => camp.except("license")}, /license is required/, "$.stamps.camp.license")
  end

  it "raises on a license that isn't an SPDX id" do
    expect_invalid({"camp" => camp.merge("license" => "free to use!")}, /SPDX/, "$.stamps.camp.license")
  end

  it "needs an attribution for a BY license, but not for CC0" do
    expect_invalid({"camp" => camp.except("attribution")}, /attribution is required/, "$.stamps.camp.attribution")
    expect { described_class.validate!({"camp" => camp.except("attribution").merge("license" => "CC0-1.0")}) }.not_to raise_error
  end

  it "raises on an unresolved reference" do
    expect_invalid({"$ref" => "./stamps.json", "referenceTo" => "stamps"}, /full JSON required/, "$.stamps")
  end
end
