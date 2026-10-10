# frozen_string_literal: true

require "rails_helper"

RSpec.describe Bot::Strategies do
  it "builds a strategy by name with its config" do
    expect(described_class.build("spin", {"degrees_per_second" => 5})).to be_a(Bot::Strategies::Spin)
    expect(described_class.build("null", {})).to be_a(Bot::Strategies::Null)
  end

  it "refuses an unknown name" do
    expect { described_class.build("Kernel", {}) }.to raise_error(Bot::Strategy::ConfigError, /unknown strategy/)
  end
end
