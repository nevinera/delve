require "rails_helper"

RSpec.describe CharacterFlag do
  let(:version) { create(:world_version) }
  let(:world_character) { create(:world_character, world: version.world, world_version: version) }

  describe "validations" do
    it "accepts each known type" do
      CharacterFlag::TYPES.each do |flag_type|
        expect(build(:character_flag, world_character:, flag_type:)).to be_valid
      end
    end

    it "rejects an unknown type" do
      expect(build(:character_flag, flag_type: "bogus")).not_to be_valid
    end

    it "accepts letters in either case, digits, _, - and /" do
      expect(build(:character_flag, identifier: "completed/killMore_Orcs-2")).to be_valid
    end

    it "rejects other characters, empty and over 64 characters" do
      ["kill more", "orc.s", "", "a" * 65].each do |identifier|
        expect(build(:character_flag, identifier:)).not_to be_valid
      end
    end
  end

  describe ".parse" do
    it "splits at the first slash" do
      expect(described_class.parse("quest/completed/killMoreOrcs")).to eq(flag_type: "quest", identifier: "completed/killMoreOrcs")
    end

    it "is nil for an invalid flag" do
      %w[quest bogus/thing quest/ quest/a.b].each { |flag| expect(described_class.parse(flag)).to be_nil }
    end
  end

  describe ".held" do
    before do
      create(:character_flag, world_character:, flag_type: "quest", identifier: "completed/a")
      create(:character_flag, world_character:, flag_type: "key", identifier: "gate")
      create(:character_flag, flag_type: "kill", identifier: "grizzle")
    end

    it "returns the given flags the world character holds, in the order given" do
      flags = ["key/gate", "kill/grizzle", "quest/completed/a", "quest/completed/b", "nonsense"]
      expect(described_class.held(world_character, flags)).to eq(["key/gate", "quest/completed/a"])
    end

    it "matches the type and identifier together" do
      expect(described_class.held(world_character, ["key/completed/a"])).to eq([])
    end

    it "is case-sensitive" do
      expect(described_class.held(world_character, ["key/Gate"])).to eq([])
    end

    it "handles nil and empty lists" do
      expect(described_class.held(world_character, nil)).to eq([])
      expect(described_class.held(world_character, [])).to eq([])
    end
  end

  describe ".grant!" do
    it "grants under the world character's current version" do
      flag = described_class.grant!(world_character, "zone/reached/darkwood")
      expect(flag).to have_attributes(flag_type: "zone", identifier: "reached/darkwood", world_version: version)
      expect(flag.to_s).to eq("zone/reached/darkwood")
    end

    it "keeps the first grant's version when granted again" do
      described_class.grant!(world_character, "key/gate")
      world_character.update!(world_version: create(:world_version, world: version.world))
      expect { described_class.grant!(world_character, "key/gate") }.not_to change(described_class, :count)
      expect(described_class.last.world_version).to eq(version)
    end

    it "refuses an invalid flag" do
      expect { described_class.grant!(world_character, "bogus/gate") }.to raise_error(ActiveRecord::RecordInvalid)
    end
  end
end
