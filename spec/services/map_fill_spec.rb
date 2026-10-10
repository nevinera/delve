require "rails_helper"

RSpec.describe MapFill do
  def wall(*pts) = {"type" => "wall", "locations" => pts.map { |x, y| {"x" => x, "y" => y} }}
  def circle(x, y, radius) = {"type" => "circle", "location" => {"x" => x, "y" => y}, "radius" => radius}
  def line(id, (x1, y1), (x2, y2)) = {"identifier" => id, "type" => "line", "start" => {"x" => x1, "y" => y1}, "end" => {"x" => x2, "y" => y2}}

  def map(barriers, connections: [], fill_points: nil)
    {"feetDimensions" => {"width" => 100, "height" => 100}, "barriers" => barriers, "connections" => connections}
      .merge(fill_points ? {"fillPoints" => fill_points.map { |x, y| {"x" => x, "y" => y} }} : {})
  end

  let(:room) { [[20, 20], [80, 20], [80, 80], [20, 80], [20, 20]] }

  def sides(edge) = [edge.left, edge.right].sort

  it "fills everything outside a closed room" do
    fill = described_class.call(map([wall(*room)]))
    expect(fill.state_at([5, 5])).to eq(:filled)
    expect(fill.state_at([50, 50])).to eq(:open)
    expect(fill.edges.select { |e| e.kind == :wall }.map { |e| sides(e) }.uniq).to eq([%i[filled open]])
    expect(fill.edges.select { |e| e.kind == :border }.map { |e| sides(e) }.uniq).to eq([%i[filled outside]])
  end

  it "fills nothing when the walls run along the map's edge" do
    fill = described_class.call(map([wall([0, 0], [100, 0], [100, 100], [0, 100], [0, 0])]))
    expect(fill.state_at([50, 50])).to eq(:open)
  end

  it "closes a gap of up to half a foot between wall ends" do
    fill = described_class.call(map([wall([20, 20], [80, 20], [80, 80], [20, 80], [20, 20.4])]))
    expect(fill.state_at([50, 50])).to eq(:open)
  end

  it "leaks through a wider gap" do
    fill = described_class.call(map([wall([20, 20], [80, 20], [80, 80], [20, 80], [20, 21])]))
    expect(fill.state_at([50, 50])).to eq(:filled)
  end

  it "seals a boundary through a circle its walls end near" do
    fill = described_class.call(map([wall([50, 20], [20, 20], [20, 80], [80, 80], [80, 20], [54, 20]), circle(52, 20, 1.5)]))
    expect(fill.state_at([50, 50])).to eq(:open)
  end

  it "treats a line connection as part of the boundary, naming its pieces" do
    fill = described_class.call(map([wall([45, 20], [20, 20], [20, 80], [80, 80], [80, 20], [55, 20])],
      connections: [line("door", [45, 20], [55, 20])]))
    door = fill.edges.find { |e| e.kind == :connection }
    expect(door.identifier).to eq("door")
    expect(sides(door)).to eq(%i[filled open])
  end

  it "leaves a dangling wall open on both sides" do
    fill = described_class.call(map([wall(*room), wall([40, 50], [60, 50])]))
    stub = fill.edges.find { |e| e.kind == :wall && e.a[1] == 50 && e.b[1] == 50 }
    expect(sides(stub)).to eq(%i[open open])
  end

  it "fills the region around each fill point" do
    rock = wall([40, 40], [60, 40], [60, 60], [40, 60], [40, 40])
    expect(described_class.call(map([wall(*room), rock])).state_at([50, 50])).to eq(:open)
    fill = described_class.call(map([wall(*room), rock], fill_points: [[50, 50]]))
    expect(fill.state_at([50, 50])).to eq(:filled)
    expect(fill.state_at([30, 30])).to eq(:open)
  end

  it "clips walls that run off the map" do
    fill = described_class.call(map([wall([-10, 50], [110, 50])]))
    expect(fill.edges.flat_map { |e| [e.a, e.b] }.flatten).to all(be_between(0, 100))
  end
end
