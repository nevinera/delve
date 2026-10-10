# frozen_string_literal: true

require "rails_helper"

RSpec.describe Bot::Strategies::Brawler do
  def unit(name, x, **fields)
    {"zone_unit_identifier" => name, "map_identifier" => "hub", "position" => {"x" => x, "y" => 0, "angle" => 0},
     "radius" => 2.5, "speed" => 20, "status" => "idle"}.merge(fields.transform_keys(&:to_s))
  end

  def state_with(units)
    Bot::GameState.new(character_name: "Botbot").tap { |s| s.apply({"type" => "instance-state", "units" => units, "checksum" => ""}) }
  end

  let(:sent) { [] }
  let(:controls) { Bot::Controls.new(->(msg) { sent << msg }) }
  let(:me) { unit("player:Botbot", 0) }

  it "attacks the nearest hostile in reach, walking into range" do
    state = state_with({"me" => me, "far" => unit("goblin-1", 30, hostility: "hostile"), "near" => unit("goblin-2", 12, hostility: "hostile")})
    described_class.new.tick(state, controls, 0)
    controls.flush

    expect(controls.attacking).to eq("near")
    expect(controls.goal).to eq({x: 12.0, y: 0.0, stop_within: 9.0})
    expect(sent).to include({type: "target", target_id: "near"}, {type: "start_attacking"})
    expect(sent).not_to include({type: "basic_attack"})
  end

  it "swings when in range, and not again too soon" do
    state = state_with({"me" => me, "goblin" => unit("goblin-1", 8, hostility: "hostile")})
    brawler = described_class.new
    [0, 0.1, 2.5].each do |t|
      brawler.tick(state, controls, t)
      controls.flush
    end
    expect(sent.count({type: "basic_attack"})).to eq(2)
  end

  it "ignores neutral units unless they're attacking it, and the dead" do
    state = state_with({"me" => me, "deer" => unit("deer-1", 8, hostility: "neutral"),
                        "corpse" => unit("goblin-1", 8, hostility: "hostile", status: "dead")})
    described_class.new.tick(state, controls, 0)
    expect(controls.attacking).to be_nil

    state = state_with({"me" => me, "deer" => unit("deer-1", 8, hostility: "neutral", target: "me")})
    described_class.new.tick(state, controls, 0)
    expect(controls.attacking).to eq("deer")
  end

  it "does what its inner strategy does when there's nothing to fight, stopping once a fight ends" do
    brawler = described_class.new({"then" => {"strategy" => "spin", "config" => {"degrees_per_second" => 10}}})
    brawler.tick(state_with({"me" => me, "goblin" => unit("goblin-1", 8, hostility: "hostile")}), controls, 0)
    brawler.tick(state_with({"me" => me}), controls, 1)
    brawler.tick(state_with({"me" => me}), controls, 2)
    expect([controls.attacking, controls.goal, controls.facing]).to eq([nil, nil, 350.0])
  end

  it "respawns when dead" do
    brawler = described_class.new
    brawler.tick(state_with({"me" => me.merge("status" => "dead")}), controls, 0)
    controls.flush
    expect(sent).to include({type: "respawn"})
  end

  it "explains a bad inner strategy" do
    expect { described_class.new({"then" => "goto"}) }.to raise_error(Bot::Strategy::ConfigError, /then must be/)
    expect { described_class.new({"then" => {"strategy" => "dance"}}) }.to raise_error(Bot::Strategy::ConfigError, /unknown strategy/)
  end
end
