require "rails_helper"

RSpec.describe Zone, type: :model do
  describe "validations" do
    it "is valid with valid attributes" do
      expect(build(:zone)).to be_valid
    end

    describe "identifier" do
      it "requires an identifier" do
        expect(build(:zone, identifier: nil)).not_to be_valid
      end

      it "allows lowercase letters and underscores" do
        expect(build(:zone, identifier: "goblin_cave")).to be_valid
      end

      it "rejects uppercase letters" do
        expect(build(:zone, identifier: "Goblin_Cave")).not_to be_valid
      end

      it "rejects digits" do
        expect(build(:zone, identifier: "goblin_cave_1")).not_to be_valid
      end

      it "rejects hyphens" do
        expect(build(:zone, identifier: "goblin-cave")).not_to be_valid
      end
    end

    describe "version" do
      it "requires a version" do
        expect(build(:zone, version: nil)).not_to be_valid
      end

      it "accepts a two-segment version" do
        expect(build(:zone, version: "1.5")).to be_valid
      end

      it "accepts a version with multi-digit segments" do
        expect(build(:zone, version: "12.34")).to be_valid
      end

      it "rejects a single-segment version" do
        expect(build(:zone, version: "1")).not_to be_valid
      end

      it "rejects a three-segment version" do
        expect(build(:zone, version: "1.2.3")).not_to be_valid
      end

      it "rejects non-numeric segments" do
        expect(build(:zone, version: "1.a")).not_to be_valid
      end

      it "enforces uniqueness scoped to identifier" do
        create(:zone, identifier: "goblin_cave", version: "1.0")
        expect(build(:zone, identifier: "goblin_cave", version: "1.0")).not_to be_valid
      end

      it "allows the same version for a different identifier" do
        create(:zone, identifier: "goblin_cave", version: "1.0")
        expect(build(:zone, identifier: "spider_den", version: "1.0")).to be_valid
      end

      it "allows a different version for the same identifier" do
        create(:zone, identifier: "goblin_cave", version: "1.0")
        expect(build(:zone, identifier: "goblin_cave", version: "1.1")).to be_valid
      end
    end

    describe "name" do
      it "requires a name" do
        expect(build(:zone, name: nil)).not_to be_valid
      end
    end

    describe "config_url" do
      it "requires a config_url" do
        expect(build(:zone, config_url: nil)).not_to be_valid
      end
    end

    describe "description" do
      it "allows a nil description" do
        expect(build(:zone, description: nil)).to be_valid
      end

      it "allows a description within the limit" do
        expect(build(:zone, description: "a" * 1024)).to be_valid
      end

      it "rejects a description over 1024 characters" do
        expect(build(:zone, description: "a" * 1025)).not_to be_valid
      end
    end
  end
end
