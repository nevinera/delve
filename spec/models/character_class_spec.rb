require "rails_helper"

RSpec.describe CharacterClass, type: :model do
  let(:user) { create(:user) }

  describe "validations" do
    it "is valid with all required fields" do
      expect(build(:character_class, user: user, identifier: "puncher")).to be_valid
    end

    it "requires a location" do
      cc = build(:character_class, user: user, identifier: "puncher", location: nil)
      expect(cc).not_to be_valid
      expect(cc.errors[:location]).to be_present
    end

    it "requires at least 3 characters in the identifier" do
      cc = build(:character_class, user: user, identifier: "ab")
      expect(cc).not_to be_valid
      expect(cc.errors[:identifier]).to be_present
    end

    it "rejects uppercase letters in the identifier" do
      cc = build(:character_class, user: user, identifier: "Puncher")
      expect(cc).not_to be_valid
      expect(cc.errors[:identifier]).to be_present
    end

    it "requires a version" do
      cc = build(:character_class, user: user, version: nil)
      expect(cc).not_to be_valid
      expect(cc.errors[:version]).to be_present
    end

    it "rejects malformed versions" do
      cc = build(:character_class, user: user, version: "1")
      expect(cc).not_to be_valid
      expect(cc.errors[:version]).to be_present
    end

    it "enforces uniqueness of version scoped to identifier" do
      create(:character_class, user: user, identifier: "puncher", version: "1.0")
      cc = build(:character_class, user: user, identifier: "puncher", version: "1.0")
      expect(cc).not_to be_valid
      expect(cc.errors[:version]).to be_present
    end

    it "allows a new version of the same identifier" do
      create(:character_class, user: user, identifier: "puncher", version: "1.0")
      cc = build(:character_class, user: user, identifier: "puncher", version: "1.1")
      expect(cc).to be_valid
    end

    it "defaults primary_stats and secondary_stats to empty arrays at the database level" do
      expect(CharacterClass.new.primary_stats).to eq([])
      expect(CharacterClass.new.secondary_stats).to eq([])
    end

    it "does not validate primary_stats/secondary_stats shape at the model level" do
      # These fields are populated asynchronously by FetchCharacterClassContentJob, well
      # after the record is first created, so the model can't require valid content up
      # front the way the JSON content validator does (same reasoning as Zone#elvl).
      cc = build(:character_class, user: user, primary_stats: [], secondary_stats: [])
      expect(cc).to be_valid
    end
  end

  describe "after create" do
    include ActiveJob::TestHelper

    it "enqueues a FetchCharacterClassContentJob" do
      expect {
        create(:character_class, user: user)
      }.to have_enqueued_job(FetchCharacterClassContentJob)
    end
  end
end
