require "rails_helper"

RSpec.describe CharacterVisit do
  let(:version) { create(:world_version) }
  let(:world_character) { create(:world_character, world: version.world, world_version: version) }

  describe ".record!" do
    it "records a zone, map or place visit under the world character's version" do
      described_class.record!(world_character, zone: "darkwood")
      described_class.record!(world_character, zone: "darkwood", map: "glade")
      described_class.record!(world_character, zone: "darkwood", map: "glade", place: "pond")
      expect(world_character.character_visits.pluck(:map_identifier, :place_identifier))
        .to contain_exactly(["", ""], ["glade", ""], ["glade", "pond"])
      expect(world_character.character_visits.pluck(:world_version_id).uniq).to eq([version.id])
    end

    it "keeps the first visit when one's recorded again" do
      first = described_class.record!(world_character, zone: "darkwood", map: "glade")
      world_character.update!(world_version: create(:world_version, world: version.world))
      expect(described_class.record!(world_character, zone: "darkwood", map: "glade")).to eq(first)
      expect(first.reload.world_version).to eq(version)
      expect(world_character.character_visits.count).to eq(1)
    end

    it "takes nil map and place as blank" do
      described_class.record!(world_character, zone: "darkwood", map: nil, place: nil)
      expect(world_character.character_visits.sole).to have_attributes(map_identifier: "", place_identifier: "")
    end

    it "refuses a place without a map" do
      expect { described_class.record!(world_character, zone: "darkwood", place: "pond") }
        .to raise_error(ActiveRecord::RecordInvalid, /needs a map/)
    end

    it "refuses a missing zone or a malformed identifier" do
      expect { described_class.record!(world_character, zone: "") }.to raise_error(ActiveRecord::RecordInvalid)
      expect { described_class.record!(world_character, zone: "darkwood", map: "no spaces") }.to raise_error(ActiveRecord::RecordInvalid)
    end
  end

  describe ".in_zone" do
    it "lists the zone's visits, oldest first" do
      described_class.record!(world_character, zone: "darkwood")
      described_class.record!(world_character, zone: "darkwood", map: "glade", place: "pond")
      described_class.record!(world_character, zone: "cave")
      expect(described_class.in_zone(world_character, "darkwood"))
        .to eq([{map: "", place: ""}, {map: "glade", place: "pond"}])
    end
  end
end
