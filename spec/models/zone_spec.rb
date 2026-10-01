require "rails_helper"

RSpec.describe Zone, type: :model do
  describe "validations" do
    it "is valid with valid attributes" do
      expect(build(:zone)).to be_valid
    end

    it "allows hyphenated world zone keys" do
      expect(build(:zone, identifier: "goblin-cave")).to be_valid
    end

    it "requires an identifier" do
      expect(build(:zone, identifier: nil)).not_to be_valid
    end

    it "requires a path" do
      expect(build(:zone, path: nil)).not_to be_valid
    end

    it "requires a world version" do
      expect(build(:zone, world_version: nil)).not_to be_valid
    end

    it "requires identifier to be unique within a world version" do
      existing = create(:zone, identifier: "darkwood")
      expect(build(:zone, identifier: "darkwood", world_version: existing.world_version)).not_to be_valid
      expect(build(:zone, identifier: "darkwood")).to be_valid
    end
  end

  describe "#exits" do
    it "is the keys of its links" do
      zone = build(:zone, links: {"road/north" => {"zone" => "cave", "connection" => "mouth/in"}})
      expect(zone.exits).to eq(["road/north"])
    end
  end
end
