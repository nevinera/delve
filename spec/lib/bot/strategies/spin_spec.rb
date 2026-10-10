# frozen_string_literal: true

require "rails_helper"

RSpec.describe Bot::Strategies::Spin do
  let(:controls) { Bot::Controls.new(->(_) {}) }

  it "turns left at its rate, from the first tick" do
    spin = described_class.new({"degrees_per_second" => 20})
    spin.tick(nil, controls, 10.0)
    spin.tick(nil, controls, 10.5)
    spin.tick(nil, controls, 11.0)
    expect(controls.facing).to eq(340)
  end

  it "needs a numeric rate" do
    expect { described_class.new({"degrees_per_second" => "fast"}) }.to raise_error(Bot::Strategy::ConfigError)
  end
end
