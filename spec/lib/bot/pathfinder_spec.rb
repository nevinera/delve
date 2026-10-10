# frozen_string_literal: true

require "rails_helper"

RSpec.describe Bot::Pathfinder do
  # A 100x100 map with a wall across the middle (x = 50), open only above
  # y = 80, and a circle at (75, 20).
  let(:map_data) do
    {"feetDimensions" => {"width" => 100, "height" => 100},
     "barriers" => [
       {"type" => "wall", "locations" => [{"x" => 50, "y" => 0}, {"x" => 50, "y" => 80}]},
       {"type" => "circle", "location" => {"x" => 75, "y" => 20}, "radius" => 5}
     ]}
  end
  let(:finder) { described_class.new(map_data, clearance: 3) }

  it "goes straight when nothing's in the way" do
    expect(finder.path([10, 10], [30, 40])).to eq([[30, 40]])
  end

  it "routes around a wall, keeping clear of its end" do
    path = finder.path([20, 20], [80, 50])
    expect(path.last).to eq([80, 50])
    expect(path.size).to be > 1
    corner = path.first
    expect(corner[1]).to be > 80
    ([[20, 20]] + path).each_cons(2) { |a, b| expect(finder.clear?(a, b)).to be(true) }
  end

  it "keeps its clearance from circles" do
    expect(finder.clear?([60, 20], [90, 20])).to be(false)
    expect(finder.clear?([60, 30], [90, 30])).to be(true)
  end

  it "finds no route into a closed-off area" do
    closed = map_data.merge("barriers" => [{"type" => "wall", "locations" => [{"x" => 50, "y" => 0}, {"x" => 50, "y" => 100}]}])
    expect(described_class.new(closed, clearance: 3).path([20, 20], [80, 50])).to be_nil
  end

  it "steps out to open ground first when the start is inside a barrier's clearance" do
    path = finder.path([48.5, 20], [20, 20])
    expect(path.last).to eq([20, 20])
    expect(50 - path.first[0]).to be >= 3
  end
end
