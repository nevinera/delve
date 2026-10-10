# frozen_string_literal: true

require "rails_helper"

RSpec.describe Bot::Strategies::Goto do
  let(:zone_data) do
    {"maps" => [{"identifier" => "hub", "feetDimensions" => {"width" => 100, "height" => 100},
                 "barriers" => [{"type" => "wall", "locations" => [{"x" => 50, "y" => 0}, {"x" => 50, "y" => 80}]}]}]}
  end
  let(:controls) { Bot::Controls.new(->(_) {}) }

  def state_at(x, y, map: "hub")
    me = {"zone_unit_identifier" => "player:Botbot", "map_identifier" => map, "position" => {"x" => x, "y" => y, "angle" => 0},
          "radius" => 2.5, "speed" => 20}
    Bot::GameState.new(character_name: "Botbot", zone_data:).tap { |s| s.apply({"type" => "instance-state", "units" => {"a" => me}, "checksum" => ""}) }
  end

  # Runs the tick and the runner's steering.
  def tick(goto, state, now)
    goto.tick(state, controls, now)
    controls.steer(state.me, lookahead: 0.1)
  end

  it "heads for the route's first waypoint, around the wall" do
    goto = described_class.new({"x" => 80, "y" => 50})
    tick(goto, state_at(20, 20), 0)
    expect(controls.goal[:y]).to be > 80
    expect(controls.keys).to eq(["forward"])
  end

  it "stops on arrival, quitting when asked" do
    goto = described_class.new({"x" => 30, "y" => 20, "then" => "quit"})
    tick(goto, state_at(20, 20), 0)
    expect(controls.goal).to include(x: 30.0, y: 20.0)
    tick(goto, state_at(29.5, 20), 0.5)
    tick(goto, state_at(29.5, 20), 0.6)
    expect([controls.keys, controls.quit?, controls.quit_reason]).to eq([[], true, "arrived at (30.0, 20.0)"])
  end

  it "quits when there's no route" do
    goto = described_class.new({"x" => 500, "y" => 500})
    tick(goto, state_at(20, 20), 0)
    expect(controls.quit_reason).to match(/no route/)
  end

  it "replans when stuck, then gives up" do
    goto = described_class.new({"x" => 80, "y" => 50})
    state = state_at(20, 20)
    (0..10).each { |t| tick(goto, state, t.to_f) }
    expect(controls.quit_reason).to match(/stuck/)
  end

  it "needs a numeric point" do
    expect { described_class.new({"x" => 1}) }.to raise_error(Bot::Strategy::ConfigError)
    expect { described_class.new({"x" => 1, "y" => 2, "then" => "dance"}) }.to raise_error(Bot::Strategy::ConfigError, /then/)
  end
end
