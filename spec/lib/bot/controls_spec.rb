require "rails_helper"

RSpec.describe Bot::Controls do
  let(:sent) { [] }
  let(:controls) { described_class.new(->(msg) { sent << msg }).tap { |c| c.adopt("at" => [0, 10, 0], "yaw" => 0.5) } }

  it "reports a move first, then heartbeats once a second standing still" do
    controls.report(0)
    controls.report(0.5)
    controls.report(1)
    expect(sent.map { |m| m[:type] }).to eq(%w[move heartbeat])
    expect(sent.first).to include(at: [0.0, 10.0, 0.0], yaw: 0.5, move: include(forward: 0, gait: "run"))
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

  it "stops short of a goal by stop_within" do
    controls.move_toward(100, 0, stop_within: 5)
    50.times { controls.advance(0.1) }
    expect(controls.forward).to eq(0)
    expect(controls.at[0]).to be_within(0.001).of(95)
  end
end
