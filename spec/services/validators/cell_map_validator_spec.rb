require "rails_helper"

RSpec.describe Validators::CellMapValidator, type: :validator do
  let(:cell_map) do
    {
      "version" => 1, "theme" => "glade", "seed" => 3,
      "grid" => {"type" => "hex", "cols" => 3, "rows" => 2},
      "cells" => ["T..", "%~."],
      "trails" => [{"width" => 0.8, "points" => [[0, 1], [2.5, 0.25]]}]
    }
  end

  def expect_invalid(data, message, path)
    expect { described_class.validate!(data) }
      .to raise_error(Validators::ValidationError, message) { |e| expect(e.path).to eq(path) }
  end

  it "accepts a cell map" do
    expect { described_class.validate!(cell_map) }.not_to raise_error
  end

  it "accepts the client's examples" do
    Dir[Rails.root.join("client/src/cellMap/examples/*.json")].each do |file|
      expect { described_class.validate!(JSON.parse(File.read(file))) }.not_to raise_error
    end
  end

  it "accepts colors from the theme's palette" do
    expect { described_class.validate!(cell_map.merge("colors" => {"meadow" => "#aabbcc", "forest" => "#2F4A2C"})) }.not_to raise_error
  end

  context "bridges" do
    let(:big_map) do
      cell_map.merge("grid" => {"type" => "hex", "cols" => 12, "rows" => 12}, "cells" => Array.new(12) { "." * 12 }, "trails" => [])
    end

    it "accepts a straight bridge of up to 8 steps" do
      expect { described_class.validate!(big_map.merge("bridges" => [{"from" => [2, 1], "to" => [2, 9]}, {"from" => [8, 8], "to" => [11, 6]}])) }.not_to raise_error
    end

    it "raises on a bridge that isn't straight" do
      expect_invalid(big_map.merge("bridges" => [{"from" => [2, 1], "to" => [3, 5]}]), /must run straight/, "$.bridges[0]")
    end

    it "raises on a bridge longer than 8 steps" do
      expect_invalid(big_map.merge("bridges" => [{"from" => [2, 1], "to" => [2, 10]}]), /reach 1 to 8 cells/, "$.bridges[0]")
    end

    it "raises on a bridge end off the grid" do
      expect_invalid(big_map.merge("bridges" => [{"from" => [2, 1], "to" => [2, 12]}]), /must be a cell on the grid/, "$.bridges[0].to")
    end
  end

  it "raises on an unsupported version" do
    expect_invalid(cell_map.merge("version" => 2), /version must be 1/, "$.version")
  end

  it "raises on an unknown theme" do
    expect_invalid(cell_map.merge("theme" => "caves"), /must be one of: "glade"/, "$.theme")
  end

  it "raises on a color the theme doesn't have" do
    expect_invalid(cell_map.merge("colors" => {"sky" => "#000000"}), /must be one of:/, "$.colors.sky")
  end

  it "raises on a color that isn't #rrggbb" do
    expect_invalid(cell_map.merge("colors" => {"meadow" => "green"}), /meadow must be a "#rrggbb" color/, "$.colors.meadow")
  end

  it "raises on a grid type the theme doesn't support" do
    expect_invalid(cell_map.merge("grid" => cell_map["grid"].merge("type" => "square")), /must be one of: "hex"/, "$.grid.type")
  end

  it "raises on a grid too big" do
    expect_invalid(cell_map.merge("grid" => cell_map["grid"].merge("cols" => 201)), /cols must be from 1 to 200/, "$.grid.cols")
  end

  it "raises when the rows don't match the grid" do
    expect_invalid(cell_map.merge("cells" => ["T.."]), /has 1 rows, grid.rows is 2/, "$.cells")
  end

  it "raises when a row's length doesn't match the grid" do
    expect_invalid(cell_map.merge("cells" => ["T..", "%~"]), /has 2 cells, grid.cols is 3/, "$.cells[1]")
  end

  it "raises on cells outside the theme's alphabet" do
    expect_invalid(cell_map.merge("cells" => ["T..", "%#."]), /has unknown cells: "#"/, "$.cells[1]")
  end

  it "raises on a trail with one point" do
    expect_invalid(cell_map.merge("trails" => [{"width" => 1, "points" => [[0, 0]]}]), /at least 2 elements/, "$.trails[0].points")
  end

  it "raises on a trail point that isn't [col, row]" do
    expect_invalid(cell_map.merge("trails" => [{"width" => 1, "points" => [[0, 0], {"x" => 1}]}]), /must be \[col, row\]/, "$.trails[0].points[1]")
  end

  describe ".feet_size" do
    it "matches the client's hex layout" do
      size = described_class.feet_size({"cols" => 2, "rows" => 1}, Math.sqrt(3))
      expect(size["width"]).to be_within(1e-9).of(3.5)
      expect(size["height"]).to be_within(1e-9).of(1.5 * Math.sqrt(3))
    end
  end
end
