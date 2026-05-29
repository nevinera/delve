require "rails_helper"

RSpec.describe CharacterClass, type: :model do
  let(:user) { create(:user, handle: "nevinera") }

  describe "validations" do
    it "is valid with all required fields" do
      cc = build(:character_class, user: user, identifier: "nevinera/puncher")
      expect(cc).to be_valid
    end

    it "requires a location" do
      cc = build(:character_class, user: user, identifier: "nevinera/puncher", location: nil)
      expect(cc).not_to be_valid
      expect(cc.errors[:location]).to be_present
    end

    it "requires a definition" do
      cc = build(:character_class, user: user, identifier: "nevinera/puncher", definition: nil)
      expect(cc).not_to be_valid
      expect(cc.errors[:definition]).to be_present
    end

    it "requires the user to have a handle" do
      handleless = create(:user, handle: nil)
      cc = build(:character_class, user: handleless, identifier: "puncher")
      expect(cc).not_to be_valid
      expect(cc.errors[:base]).to include("owner must set a handle before registering a character class")
    end

    it "enforces uniqueness of identifier" do
      create(:character_class, user: user, identifier: "nevinera/puncher")
      cc = build(:character_class, user: user, identifier: "nevinera/puncher")
      expect(cc).not_to be_valid
      expect(cc.errors[:identifier]).to be_present
    end

    it "requires identifier to match handle/name format" do
      cc = build(:character_class, user: user, identifier: "nevinera/bad identifier")
      expect(cc).not_to be_valid
      expect(cc.errors[:identifier]).to be_present
    end
  end

  describe "identifier auto-prefix" do
    it "prefixes the identifier with the user's handle when missing" do
      cc = create(:character_class, user: user, identifier: "puncher")
      expect(cc.identifier).to eq("nevinera/puncher")
    end

    it "does not double-prefix if the handle is already present" do
      cc = create(:character_class, user: user, identifier: "nevinera/puncher")
      expect(cc.identifier).to eq("nevinera/puncher")
    end
  end

  describe "definition serialization" do
    it "round-trips a hash through the database" do
      defn = {"name" => "Puncher", "abilities" => [{"name" => "Punch"}]}
      cc = create(:character_class, user: user, identifier: "nevinera/puncher", definition: defn)
      expect(cc.reload.definition).to eq(defn)
    end
  end
end
