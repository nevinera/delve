# frozen_string_literal: true

require "rails_helper"

RSpec.describe Bot::Strategies::Follow do
  def unit(name, x)
    {"zone_unit_identifier" => "player:#{name}", "map_identifier" => "hub", "position" => {"x" => x, "y" => 0, "angle" => 0},
     "radius" => 2.5, "speed" => 20, "health" => 1, "max_health" => 1, "resources" => {}, "status" => "alive", "active_status_effects" => []}
  end

  def state_with(target_x)
    units = {"a" => unit("Botbot", 0), "b" => unit("Eric", target_x)}
    Bot::GameState.new(character_name: "Botbot").tap { |s| s.apply({"type" => "instance-state", "units" => units, "checksum" => ""}) }
  end

  let(:controls) { Bot::Controls.new(->(_) {}) }
  let(:follow) { described_class.new({"target" => "eric"}) }

  it "walks to a player within notice range, aiming to stop 5 feet from their edge" do
    follow.tick(state_with(25), controls, 0)
    expect(controls.goal).to eq({x: 25.0, y: 0.0, stop_within: 10.0})
  end

  it "stands still when they're out of range, or already close" do
    follow.tick(state_with(40), controls, 0)
    expect(controls.goal).to be_nil
    follow.tick(state_with(9), controls, 0)
    expect([controls.goal, controls.keys]).to eq([nil, []])
  end

  it "needs a target, and a stop distance inside the notice distance" do
    expect { described_class.new({}) }.to raise_error(Bot::Strategy::ConfigError, /target/)
    expect { described_class.new({"target" => "Eric", "stop_feet" => 40}) }.to raise_error(Bot::Strategy::ConfigError, /less than/)
  end
end
