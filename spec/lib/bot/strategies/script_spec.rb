# frozen_string_literal: true

require "rails_helper"

RSpec.describe Bot::Strategies::Script do
  let(:controls) { Bot::Controls.new(->(_) {}) }

  def run(script, *times)
    times.map do |t|
      script.tick(nil, controls, t)
      [controls.facing, controls.keys, controls.quit?]
    end
  end

  it "performs each step its seconds after the one before" do
    script = described_class.new({"steps" => [
      {"after" => 0, "do" => "move", "keys" => ["forward"]},
      {"after" => 1.5, "do" => "face", "degrees" => 90},
      {"after" => 2, "do" => "stop"},
      {"after" => 0, "do" => "quit"}
    ]})

    expect(run(script, 100.0, 101.0, 101.5, 103.4, 103.5)).to eq([
      [0, ["forward"], false],
      [0, ["forward"], false],
      [90, ["forward"], false],
      [90, ["forward"], false],
      [90, [], true]
    ])
  end

  it "sets a point to walk to, with an optional stop distance" do
    script = described_class.new({"steps" => [{"do" => "move_toward", "x" => 3, "y" => 4, "stop_within" => 2}]})
    script.tick(nil, controls, 0.0)
    expect(controls.goal).to eq({x: 3.0, y: 4.0, stop_within: 2.0})
  end

  it "loops when asked" do
    script = described_class.new({"loop" => true, "steps" => [{"after" => 1, "do" => "turn", "degrees" => 10}]})
    run(script, 0.0, 1.0, 2.0, 3.0)
    expect(controls.facing).to eq(30)
  end

  it "explains a bad step" do
    expect { described_class.new({"steps" => [{"do" => "dance"}]}) }.to raise_error(Bot::Strategy::ConfigError, /step 1: unknown action "dance"/)
    expect { described_class.new({"steps" => [{"do" => "face"}]}) }.to raise_error(Bot::Strategy::ConfigError, /needs degrees/)
    expect { described_class.new({"steps" => [{"do" => "stop", "after" => -1}]}) }.to raise_error(Bot::Strategy::ConfigError, /after/)
    expect { described_class.new({}) }.to raise_error(Bot::Strategy::ConfigError, /at least one/)
    expect { described_class.new({"loop" => true, "steps" => [{"do" => "stop"}]}) }.to raise_error(Bot::Strategy::ConfigError, /looping/)
  end
end
