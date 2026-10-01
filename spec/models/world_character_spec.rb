require "rails_helper"

RSpec.describe WorldCharacter, type: :model do
  it "is valid with a world and character" do
    expect(build(:world_character)).to be_valid
  end

  it "is unique per world and character" do
    existing = create(:world_character)
    expect(build(:world_character, world: existing.world, character: existing.character)).not_to be_valid
    expect(build(:world_character, character: existing.character)).to be_valid
  end

  it "defaults to active" do
    expect(create(:world_character)).to be_active
  end

  describe "#position" do
    it "is the zone and connection, or nil until both are set" do
      expect(build(:world_character).position).to be_nil
      expect(build(:world_character, zone_identifier: "dw", connection_key: "m/c").position).to eq(["dw", "m/c"])
    end
  end
end
