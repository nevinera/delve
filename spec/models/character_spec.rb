require "rails_helper"

RSpec.describe Character, type: :model do
  let(:user) { create(:user) }
  let(:character_class) { create(:character_class) }

  describe "validations" do
    it "is valid with all required fields" do
      expect(build(:character, user: user, character_class: character_class)).to be_valid
    end

    it "requires a name" do
      c = build(:character, user: user, character_class: character_class, name: nil)
      expect(c).not_to be_valid
      expect(c.errors[:name]).to be_present
    end

    it "requires name to be at least 6 characters" do
      c = build(:character, user: user, character_class: character_class, name: "Hi-A")
      expect(c).not_to be_valid
      expect(c.errors[:name]).to be_present
    end

    it "rejects names longer than 16 characters" do
      c = build(:character, user: user, character_class: character_class, name: "A" * 17)
      expect(c).not_to be_valid
      expect(c.errors[:name]).to be_present
    end

    it "rejects names with digits" do
      c = build(:character, user: user, character_class: character_class, name: "Hero1234")
      expect(c).not_to be_valid
      expect(c.errors[:name]).to be_present
    end

    it "rejects names with spaces" do
      c = build(:character, user: user, character_class: character_class, name: "Hero Name")
      expect(c).not_to be_valid
      expect(c.errors[:name]).to be_present
    end

    it "allows names with letters and dashes" do
      c = build(:character, user: user, character_class: character_class, name: "Dark-Elf")
      expect(c).to be_valid
    end

    it "enforces uniqueness of name" do
      create(:character, user: user, character_class: character_class, name: "Ariana-AA")
      c = build(:character, user: user, character_class: character_class, name: "Ariana-AA")
      expect(c).not_to be_valid
      expect(c.errors[:name]).to be_present
    end

    it "requires a user" do
      c = build(:character, character_class: character_class)
      c.user = nil
      expect(c).not_to be_valid
    end

    it "requires a character class" do
      c = build(:character, user: user)
      c.character_class = nil
      expect(c).not_to be_valid
    end
  end
end
