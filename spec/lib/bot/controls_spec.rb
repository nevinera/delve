require "rails_helper"

RSpec.describe Bot::Controls do
  let(:sent) { [] }
  let(:controls) { described_class.new(->(msg) { sent << msg }).tap { |c| c.adopt("at" => [0, 10, 0], "yaw" => 0.5) } }

  it "reports a move first, then heartbeats once a second standing still" do
    controls.report(0)
    controls.report(0.5)
    controls.report(1)
    expect(sent.map { |m| m[:type] }).to eq(%w[move heartbeat])
    expect(sent.first).to include(t: 0, at: [0.0, 10.0, 0.0], yaw: 0.5, move: include(forward: 0, gait: "run"))
    expect(sent.last).to include(t: 1000)
  end

  it "climbs toward a goal's height no faster than it moves across" do
    controls.move_toward(0, 100, y: 100)
    controls.advance(1)
    expect(controls.at).to eq([0.0, 31.0, 21.0])
  end

  it "reports a move afresh from where the server puts it back" do
    controls.report(0)
    controls.adopt("at" => [5, 10, 5], "yaw" => 1)
    controls.report(0.1)
    expect(sent.map { |m| m[:type] }).to eq(%w[move move])
    expect(sent.last).to include(at: [5.0, 10.0, 5.0], yaw: 1.0)
  end

  it "runs to a goal, twice a second reporting where it is, and stops there" do
    controls.move_toward(0, 42, stop_within: 0, y: 20)
    controls.advance(1)
    controls.report(0)
    expect(controls.at).to eq([0.0, 20.0, 21.0])
    expect(sent.last).to include(type: "move", move: include(forward: 1))

    controls.report(0.5)
    expect(sent.last[:type]).to eq("heartbeat")

    controls.advance(1)
    controls.advance(1)
    controls.report(1)
    expect(controls.at).to eq([0.0, 20.0, 42.0])
    expect(sent.last).to include(type: "move", move: include(forward: 0))
  end

  context "on the ground" do
    # Ground rising 1 ft a foot east of x = 10, a lake 10 ft deep west of x = -10, and the land
    # ending at x = 100, with a slab standing across x = `wall` if there's one. Stand gives
    # [height, swimming] like Bot::Ground's.
    let(:ground) do
      Class.new do
        def initialize(slope, wall: nil)
          @slope = slope
          @wall = wall
        end

        def stand(x, _z, _feet = nil)
          return nil if x > 100
          return [5.5, true] if x < -10
          [10 + @slope * [x - 10, 0].max, false]
        end

        def enters?(a, b) = !@wall.nil? && (a[0] < @wall) != (b[0] < @wall)
      end
    end
    let(:controls) { described_class.new(->(msg) { sent << msg }, ground: ground.new(1)).tap { |c| c.adopt("at" => [0, 10, 0], "yaw" => 0) } }

    it "keeps to the ground's height, whatever height it's told" do
      controls.move_toward(50, 0, y: 500)
      controls.advance(1)
      expect(controls.at[0..1]).to eq([21.0, 21.0])
    end

    it "stops at the end of the land, or a slope too steep to walk" do
      controls.move_toward(200, 0)
      6.times { controls.advance(1) }
      expect(controls.at[0]).to be <= 100
      expect(controls.forward).to eq(0)

      steep = described_class.new(->(msg) {}, ground: ground.new(2)).tap { |c| c.adopt("at" => [0, 10, 0], "yaw" => 0) }
      steep.move_toward(50, 0)
      3.times { steep.advance(0.25) }
      expect(steep.at[0]).to be < 15
      expect(steep.forward).to eq(0)
    end

    it "stops at a slab in the way" do
      walled = described_class.new(->(msg) {}, ground: ground.new(0, wall: 30)).tap { |c| c.adopt("at" => [0, 10, 0], "yaw" => 0) }
      walled.move_toward(50, 0)
      10.times { walled.advance(0.25) }
      expect(walled.at[0]).to be < 30
      expect(walled.forward).to eq(0)
    end

    it "swims in deep water, at swimming speed" do
      controls.move_toward(-100, 0)
      controls.advance(0.5)
      controls.advance(1)
      expect(controls.at[1]).to eq(5.5)
      expect(controls.at[0]).to be_within(1e-9).of(-10.5 - 14.2)
      controls.report(0)
      expect(sent.last[:move]).to include(swim: true)
    end
  end

  it "stops short of a goal by stop_within" do
    controls.move_toward(100, 0, stop_within: 5)
    50.times { controls.advance(0.1) }
    expect(controls.forward).to eq(0)
    expect(controls.at[0]).to be_within(0.001).of(95)
  end
end
