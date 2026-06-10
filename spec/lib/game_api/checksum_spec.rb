# frozen_string_literal: true

require "rails_helper"

RSpec.describe GameApi::Checksum do
  let(:fixture) do
    path = Rails.root.join("game-server", "internal", "instancestate", "testdata", "checksum_parity.json")
    JSON.parse(File.read(path))
  end

  describe ".compute_checksum" do
    it "matches the expected checksum in the shared parity fixture" do
      expect(described_class.compute_checksum(fixture["units"]))
        .to eq(fixture["expected_checksum"])
    end

    it "changes when a unit's health changes" do
      units = fixture["units"].transform_values(&:dup)
      units.values.first["health"] = 1
      expect(described_class.compute_checksum(units))
        .not_to eq(fixture["expected_checksum"])
    end

    it "is order-independent — same result regardless of hash insertion order" do
      forward = fixture["units"]
      reversed = fixture["units"].to_a.reverse.to_h
      expect(described_class.compute_checksum(forward))
        .to eq(described_class.compute_checksum(reversed))
    end
  end
end
