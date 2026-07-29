require "rails_helper"

RSpec.describe AwardCharacterItem do
  let(:character) { create(:character) }
  let(:zone) { create(:zone) }

  let(:source_data) do
    {
      "zone" => {"database_id" => zone.id.to_s, "identifier" => zone.identifier, "version" => zone.version},
      "identifier" => "sword-of-doom",
      "name" => "Sword of Doom",
      "slot" => "main_hand",
      "ilvl" => 584,
      "stats" => {}
    }
  end

  def call(data = source_data)
    described_class.call(character: character, source_data: data)
  end

  describe "#call" do
    it "returns the new CharacterItem" do
      item = call
      expect(item).to be_a(CharacterItem)
      expect(item).to be_persisted
    end

    it "creates a CharacterItem with the expected attributes" do
      call
      item = CharacterItem.last
      expect(item.character).to eq(character)
      expect(item.provenance_zone).to eq(zone)
      expect(item.source_key).to eq("#{zone.identifier}/#{zone.version}/sword-of-doom")
      expect(item.name).to eq("Sword of Doom")
      expect(item.slot).to eq("main_hand")
      expect(item.ilvl).to eq(584)
    end

    it "stores the full source_data as source_json" do
      call
      expect(CharacterItem.last.source_json).to eq(source_data)
    end

    it "sets received_at to now" do
      call
      expect(CharacterItem.last.received_at).to be_within(2.seconds).of(Time.current)
    end

    it "persists stats from the stats hash" do
      call(source_data.merge("stats" => {"strength" => 100, "crit_rating" => 40}))
      item = CharacterItem.last
      expect(item.strength).to eq(100)
      expect(item.crit_rating).to eq(40)
      expect(item.agility).to eq(0)
    end

    it "ignores unknown stat keys" do
      call(source_data.merge("stats" => {"strength" => 50, "unknown_stat" => 99}))
      expect(CharacterItem.last.strength).to eq(50)
    end

    it "persists optional metadata" do
      call(source_data.merge("description" => "A fine blade"))
      expect(CharacterItem.last.description).to eq("A fine blade")
    end

    context "when the item already exists for this character and source_key" do
      before { call }

      it "returns :already_owned_this_version" do
        expect(call).to eq(:already_owned_this_version)
      end

      it "does not create a second record" do
        expect { call }.not_to change(CharacterItem, :count)
      end
    end

    context "when the character owns the same item from a different version of this zone" do
      let(:other_zone) { create(:zone, identifier: zone.identifier, version: "0.0") }

      before { create(:character_item, character: character, provenance_zone: other_zone, identifier: "sword-of-doom", source_key: "#{other_zone.identifier}/0.0/sword-of-doom") }

      it "returns [CharacterItem, :already_owned_other_version]" do
        result = call
        expect(result).to be_a(Array)
        expect(result[0]).to be_a(CharacterItem).and be_persisted
        expect(result[1]).to eq(:already_owned_other_version)
      end

      it "creates a new record for this version" do
        expect { call }.to change(CharacterItem, :count).by(1)
      end
    end

    context "when zone identifier does not match" do
      let(:bad_data) { source_data.deep_merge("zone" => {"identifier" => "wrong_zone"}) }

      it "raises ZoneMismatch" do
        expect { call(bad_data) }.to raise_error(AwardCharacterItem::ZoneMismatch, /wrong_zone/)
      end
    end

    context "when zone version does not match" do
      let(:bad_data) { source_data.deep_merge("zone" => {"version" => "9.9"}) }

      it "raises ZoneMismatch" do
        expect { call(bad_data) }.to raise_error(AwardCharacterItem::ZoneMismatch, /9\.9/)
      end
    end

    context "when the zone does not exist (character is already resolved)" do
      let(:source_data) { super().deep_merge("zone" => {"database_id" => "99999"}) }

      it "raises ActiveRecord::RecordNotFound" do
        expect { call }.to raise_error(ActiveRecord::RecordNotFound)
      end
    end

    context "when a required field is missing" do
      %w[identifier name slot ilvl].each do |field|
        it "raises MissingField for missing #{field}" do
          expect { call(source_data.except(field)) }.to raise_error(AwardCharacterItem::MissingField, /#{field}/)
        end
      end
    end
  end
end
