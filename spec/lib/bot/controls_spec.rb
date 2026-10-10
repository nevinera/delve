# frozen_string_literal: true

require "rails_helper"

RSpec.describe Bot::Controls do
  let(:sent) { [] }
  let(:controls) { described_class.new(->(msg) { sent << msg }) }

  it "sends a move only when the facing or keys change" do
    controls.move("forward")
    controls.flush
    controls.flush
    controls.turn(-30)
    controls.flush
    controls.stop
    controls.flush

    expect(sent).to eq([
      {type: "move", facing: 0.0, keys: ["forward"]},
      {type: "move", facing: 330.0, keys: ["forward"]},
      {type: "move", facing: 330.0, keys: []}
    ])
  end

  it "adopts the unit's facing without sending it back" do
    controls.adopt({"position" => {"angle" => 450}})
    controls.flush
    expect(controls.facing).to eq(90)
    expect(sent).to be_empty
  end

  it "refuses unknown keys" do
    expect { controls.move("jump") }.to raise_error(ArgumentError, /jump/)
  end
end

RSpec.describe Bot::Controls, "#move_toward" do
  let(:controls) { described_class.new(->(_) {}) }
  let(:me) { {"position" => {"x" => 0, "y" => 0}, "speed" => 20} }

  it "faces the point and walks to it, clockwise from north" do
    controls.move_toward(10, -10)
    controls.steer(me, lookahead: 0.1)
    expect([controls.facing, controls.keys]).to eq([135.0, ["forward"]])
  end

  it "stops within stop_within, or a step away" do
    controls.move_toward(0, 5, 6)
    controls.steer(me, lookahead: 0.1)
    expect([controls.keys, controls.goal]).to eq([[], nil])

    controls.move_toward(1.5, 0)
    controls.steer(me, lookahead: 0.1)
    expect(controls.goal).to be_nil
  end

  it "gives up the goal for any other movement" do
    controls.move_toward(10, 10)
    controls.turn(5)
    expect(controls.goal).to be_nil
  end
end
