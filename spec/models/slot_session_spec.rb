require "rails_helper"

RSpec.describe SlotSession, type: :model do
  let(:character) { create(:character) }
  let(:zone) { create(:zone) }

  describe "validations" do
    it "is valid with all required fields" do
      expect(build(:slot_session, character: character, zone: zone)).to be_valid
    end

    it "requires a character" do
      s = build(:slot_session, zone: zone)
      s.character = nil
      expect(s).not_to be_valid
    end

    it "requires a zone" do
      s = build(:slot_session, character: character)
      s.zone = nil
      expect(s).not_to be_valid
    end

    it "requires a token" do
      expect(build(:slot_session, character: character, zone: zone, token: nil)).not_to be_valid
    end

    it "requires an instance_identifier" do
      expect(build(:slot_session, character: character, zone: zone, instance_identifier: nil)).not_to be_valid
    end

    it "requires a slot_id" do
      expect(build(:slot_session, character: character, zone: zone, slot_id: nil)).not_to be_valid
    end

    it "allows last_confirmed_at to be nil" do
      expect(build(:slot_session, character: character, zone: zone, last_confirmed_at: nil)).to be_valid
    end

    it "enforces one session per character" do
      create(:slot_session, character: character, zone: zone)
      expect(build(:slot_session, character: character, zone: zone)).not_to be_valid
    end
  end
end
