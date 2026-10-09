require "rails_helper"

RSpec.describe QuestObjective do
  # Pinned hashes: changing them would reset every character's progress.
  let(:fixture) { JSON.parse(File.read(Rails.root.join("spec/fixtures/quests/objective_hashes.json"))) }

  it "matches every hash in the shared fixture" do
    fixture.each do |entry|
      expect(described_class.hash_of(entry["objective"])).to eq(entry["hash"]), entry["objective"].inspect
    end
  end

  it "ignores key order, blank fields, a count of 1, and unknown fields" do
    base = described_class.hash_of("type" => "kill", "zone" => "z", "unitType" => "rat")
    expect(described_class.hash_of("unitType" => "rat", "zone" => "z", "type" => "kill", "count" => 1, "map" => "", "note" => "x"))
      .to eq(base)
  end

  it "changes when any counted field changes" do
    base = {"type" => "kill", "zone" => "z", "unitType" => "rat", "count" => 5}
    expect(described_class.hash_of(base.merge("count" => 6))).not_to eq(described_class.hash_of(base))
    expect(described_class.hash_of(base.merge("map" => "m"))).not_to eq(described_class.hash_of(base))
  end
end
