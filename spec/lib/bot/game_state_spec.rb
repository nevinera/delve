# frozen_string_literal: true

require "rails_helper"

RSpec.describe Bot::GameState do
  def unit(name, x:, y:, map: "hub", radius: 2.5)
    {"zone_unit_identifier" => name, "map_identifier" => map, "position" => {"x" => x, "y" => y, "angle" => 0},
     "radius" => radius, "health" => 10, "max_health" => 10, "resources" => {}, "status" => "alive", "active_status_effects" => []}
  end

  def full_state(units) = {"type" => "instance-state", "units" => units, "checksum" => GameApi::Checksum.compute_checksum(units)}

  let(:state) { described_class.new(character_name: "Grizzle") }
  let(:units) do
    {"a" => unit("player:Grizzle", x: 0, y: 0), "b" => unit("player:Eric", x: 10, y: 0),
     "c" => unit("goblin-1", x: 40, y: 0), "d" => unit("goblin-2", x: 1, y: 0, map: "cave")}
  end

  it "loads a full state, finding the bot's own unit and other players" do
    expect(state.apply(full_state(units))).to be(true)
    expect(state).to be_loaded
    expect(state.me["zone_unit_identifier"]).to eq("player:Grizzle")
    expect(state.player("Eric")["position"]["x"]).to eq(10)
  end

  it "measures between token edges, only on the same map" do
    state.apply(full_state(units))
    expect(state.distance(state.me, state.player("Eric"))).to eq(5)
    expect(state.distance(state.me, units["d"])).to be_nil
    expect(state.units_within(30).map { |u| u["zone_unit_identifier"] }).to eq(["player:Eric"])
  end

  it "applies deltas and checks them against the checksum" do
    state.apply(full_state(units))
    moved = units.merge("b" => units["b"].merge("position" => {"x" => 20, "y" => 0, "angle" => 90}))
    moved.delete("c")
    delta = {"type" => "delta", "unit_updates" => {"b" => {"position" => {"x" => 20, "y" => 0, "angle" => 90}}},
             "unit_removals" => ["c"], "checksum" => GameApi::Checksum.compute_checksum(moved)}

    expect(state.apply(delta)).to be(true)
    expect(state.player("Eric")["position"]["x"]).to eq(20)
    expect(state.units.keys).not_to include("c")
  end

  it "adds and removes status effects by name and applier" do
    state.apply(full_state(units))
    add = {"unit_id" => "a", "status_name" => "slowed", "applier_id" => "c", "stacks" => 1, "expires_at" => 5}
    state.apply({"type" => "delta", "effect_adds" => [add], "checksum" => ""})
    expect(state.me["active_status_effects"]).to eq([add.except("unit_id")])

    state.apply({"type" => "delta", "effect_removes" => [add.slice("unit_id", "status_name", "applier_id")], "checksum" => ""})
    expect(state.me["active_status_effects"]).to eq([])
  end

  it "reports a checksum mismatch" do
    expect(state.apply(full_state(units).merge("checksum" => "nope"))).to be(false)
  end
end
