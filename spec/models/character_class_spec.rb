require "rails_helper"

RSpec.describe CharacterClass, type: :model do
  let(:user) { create(:user) }
  let(:handle) { create(:handle, user: user, identifier: "nevinera") }

  describe "validations" do
    it "is valid with all required fields" do
      expect(build(:character_class, user: user, handle: handle, identifier: "puncher")).to be_valid
    end

    it "requires a location" do
      cc = build(:character_class, user: user, handle: handle, identifier: "puncher", location: nil)
      expect(cc).not_to be_valid
      expect(cc.errors[:location]).to be_present
    end

    it "requires at least 3 characters in the identifier" do
      cc = build(:character_class, user: user, handle: handle, identifier: "ab")
      expect(cc).not_to be_valid
      expect(cc.errors[:identifier]).to be_present
    end

    it "rejects uppercase letters in the identifier" do
      cc = build(:character_class, user: user, handle: handle, identifier: "Puncher")
      expect(cc).not_to be_valid
      expect(cc.errors[:identifier]).to be_present
    end

    it "enforces uniqueness of identifier scoped to handle" do
      create(:character_class, user: user, handle: handle, identifier: "puncher")
      cc = build(:character_class, user: user, handle: handle, identifier: "puncher")
      expect(cc).not_to be_valid
      expect(cc.errors[:identifier]).to be_present
    end

    it "allows the same identifier under different handles" do
      other_handle = create(:handle, user: user, identifier: "althandle")
      create(:character_class, user: user, handle: handle, identifier: "puncher")
      cc = build(:character_class, user: user, handle: other_handle, identifier: "puncher")
      expect(cc).to be_valid
    end
  end

  describe "#full_identifier" do
    it "combines the handle identifier and slug" do
      cc = build(:character_class, user: user, handle: handle, identifier: "puncher")
      expect(cc.full_identifier).to eq("nevinera/puncher")
    end
  end

  describe "after create" do
    include ActiveJob::TestHelper

    it "enqueues a FetchCharacterClassContentJob" do
      expect {
        create(:character_class, user: user, handle: handle)
      }.to have_enqueued_job(FetchCharacterClassContentJob)
    end
  end
end
