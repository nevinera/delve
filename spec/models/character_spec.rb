require "rails_helper"

RSpec.describe Character, type: :model do
  let(:user) { create(:user) }
  let(:character_class) { create(:character_class) }

  describe "#owned_zone_items_for" do
    let(:zone) { create(:zone) }
    let(:character) { create(:character) }

    it "returns an empty hash when the character has no items" do
      expect(character.owned_zone_items_for(zone)).to eq({})
    end

    it "returns true for an item owned from this exact zone version" do
      create(:character_item, character: character, provenance_zone: zone,
        identifier: "sword", version: zone.version)
      expect(character.owned_zone_items_for(zone)).to eq({"sword" => true})
    end

    it "returns false for an item owned from a different version of this zone" do
      other_version = create(:zone, identifier: zone.identifier, version: "0.0")
      create(:character_item, character: character, provenance_zone: other_version,
        identifier: "sword", version: "0.0")
      expect(character.owned_zone_items_for(zone)).to eq({"sword" => false})
    end

    it "excludes items from zones with a different identifier" do
      other_zone = create(:zone, identifier: "other_zone")
      create(:character_item, character: character, provenance_zone: other_zone,
        identifier: "sword", version: other_zone.version)
      expect(character.owned_zone_items_for(zone)).to eq({})
    end

    it "can return multiple items with mixed ownership" do
      other_version = create(:zone, identifier: zone.identifier, version: "0.0")
      create(:character_item, character: character, provenance_zone: zone,
        identifier: "helm", version: zone.version)
      create(:character_item, character: character, provenance_zone: other_version,
        identifier: "sword", version: "0.0")
      result = character.owned_zone_items_for(zone)
      expect(result).to eq({"helm" => true, "sword" => false})
    end
  end

  describe "associations" do
    it "destroys character_items when destroyed" do
      character = create(:character)
      create(:character_item, character: character)
      expect { character.destroy }.to change(CharacterItem, :count).by(-1)
    end
  end

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

    it "requires a token_url" do
      c = build(:character, user: user, character_class: character_class, token_url: nil)
      expect(c).not_to be_valid
      expect(c.errors[:token_url]).to be_present
    end

    it "rejects a non-URL token_url" do
      c = build(:character, user: user, character_class: character_class, token_url: "not-a-url")
      expect(c).not_to be_valid
      expect(c.errors[:token_url]).to be_present
    end

    it "accepts an https token_url" do
      c = build(:character, user: user, character_class: character_class, token_url: "https://example.com/token.webp")
      expect(c).to be_valid
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
