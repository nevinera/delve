require "rails_helper"

RSpec.describe CharacterWorld do
  it "is unique per character and world" do
    existing = create(:character_world)
    expect(build(:character_world, character: existing.character, world: existing.world)).not_to be_valid
  end

  describe "#tags_available_in" do
    it "includes tags granted at or below the version, excluding higher ones" do
      cw = create(:character_world)
      old = create(:character_tag, character_world: cw, granted_version: "1.2")
      create(:character_tag, character_world: cw, granted_version: "1.11")
      wv = create(:world_version, world: cw.world, version: "1.10")
      expect(cw.tags_available_in(wv)).to eq([old])
    end
  end
end
