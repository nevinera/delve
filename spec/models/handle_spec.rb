require "rails_helper"

RSpec.describe Handle, type: :model do
  describe "validations" do
    it "is valid with a conforming identifier" do
      expect(build(:handle, identifier: "nevinera")).to be_valid
    end

    it "requires an identifier" do
      expect(build(:handle, identifier: nil)).not_to be_valid
    end

    it "requires at least 6 characters" do
      expect(build(:handle, identifier: "abc")).not_to be_valid
    end

    it "rejects uppercase letters" do
      expect(build(:handle, identifier: "Nevinera")).not_to be_valid
    end

    it "rejects hyphens" do
      expect(build(:handle, identifier: "nev-inera")).not_to be_valid
    end

    it "allows underscores" do
      expect(build(:handle, identifier: "nev_inera")).to be_valid
    end

    it "allows digits" do
      expect(build(:handle, identifier: "nevin3ra")).to be_valid
    end

    it "enforces global uniqueness" do
      create(:handle, identifier: "nevinera")
      expect(build(:handle, identifier: "nevinera")).not_to be_valid
    end

    it "allows a nil description" do
      expect(build(:handle, description: nil)).to be_valid
    end

    it "allows a description" do
      expect(build(:handle, description: "my main handle")).to be_valid
    end
  end
end
