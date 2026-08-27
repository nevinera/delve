require "rails_helper"

RSpec.describe "Play::CharacterItems", type: :request do
  let(:user) { create(:user) }
  let!(:character) { create(:character, user: user) }

  before { sign_in user }

  describe "GET /play/characters/:character_id/character_items/:id" do
    context "when the item has a single equippable slot" do
      let(:item) { create(:character_item, character: character, slot: "head") }

      it "offers a single equip button" do
        get "/play/characters/#{character.id}/character_items/#{item.id}"
        expect(response.body).to include("Equip as Head")
        expect(response.body).not_to include("Equip as Left Ring")
      end
    end

    context "when the item can go in either of two slots" do
      let(:item) { create(:character_item, character: character, slot: "ring") }

      it "offers a button for each compatible slot" do
        get "/play/characters/#{character.id}/character_items/#{item.id}"
        expect(response.body).to include("Equip as Left Ring")
        expect(response.body).to include("Equip as Right Ring")
      end
    end

    context "when the item is a two_hand weapon" do
      let(:item) { create(:character_item, character: character, slot: "two_hand") }

      it "only offers Main Hand, not Off Hand" do
        get "/play/characters/#{character.id}/character_items/#{item.id}"
        expect(response.body).to include("Equip as Main Hand")
        expect(response.body).not_to include("Equip as Off Hand")
      end
    end

    context "when the item is already equipped" do
      let(:item) { create(:character_item, character: character, slot: "ring") }

      before { create(:equipped_item, character: character, character_item: item, equipped_slot: "ring_2") }

      it "offers an unequip button instead of equip buttons" do
        get "/play/characters/#{character.id}/character_items/#{item.id}"
        expect(response.body).to include("Unequip from Right Ring")
        expect(response.body).not_to include("Equip as Left Ring")
        expect(response.body).not_to include("Equip as Right Ring")
      end
    end

    context "when the item has a weaponType" do
      let(:item) do
        create(:character_item, character: character, slot: "main_hand",
          source_json: {"weaponType" => "sword"})
      end

      it "shows the weapon type" do
        get "/play/characters/#{character.id}/character_items/#{item.id}"
        expect(response.body).to include("Weapon Type: sword")
      end
    end

    context "when the item has no weaponType" do
      let(:item) { create(:character_item, character: character, slot: "head") }

      it "does not show a weapon type" do
        get "/play/characters/#{character.id}/character_items/#{item.id}"
        expect(response.body).not_to include("Weapon Type:")
      end
    end
  end

  describe "GET /play/characters/:character_id/character_items" do
    let!(:head_item) { create(:character_item, character: character, slot: "head", name: "Helm of Whatever") }
    let!(:chest_item) { create(:character_item, character: character, slot: "chest", name: "Robe of Whatever") }

    context "without a slot filter" do
      it "lists every item" do
        get "/play/characters/#{character.id}/character_items"
        expect(response.body).to include("Helm of Whatever")
        expect(response.body).to include("Robe of Whatever")
      end
    end

    context "with a single slot filter" do
      it "only lists items matching that slot" do
        get "/play/characters/#{character.id}/character_items", params: {slot: "head"}
        expect(response.body).to include("Helm of Whatever")
        expect(response.body).not_to include("Robe of Whatever")
      end
    end

    context "with multiple slots filtered (e.g. one_hand/two_hand for a weapon slot)" do
      let!(:one_hand_item) { create(:character_item, character: character, slot: "one_hand", name: "Dagger of Whatever") }
      let!(:two_hand_item) { create(:character_item, character: character, slot: "two_hand", name: "Greatsword of Whatever") }

      it "lists items matching any of the given slots" do
        get "/play/characters/#{character.id}/character_items", params: {slot: %w[main_hand one_hand two_hand]}
        expect(response.body).to include("Dagger of Whatever")
        expect(response.body).to include("Greatsword of Whatever")
        expect(response.body).not_to include("Helm of Whatever")
      end
    end

    context "as JSON" do
      it "returns every item with identifier, name, slot, elvl, description, and stats" do
        get "/play/characters/#{character.id}/character_items", as: :json
        body = JSON.parse(response.body)

        expect(body.map { |i| i["name"] }).to contain_exactly("Helm of Whatever", "Robe of Whatever")
        head_json = body.find { |i| i["name"] == "Helm of Whatever" }
        expect(head_json).to include(
          "id" => head_item.id,
          "identifier" => head_item.identifier,
          "source_key" => head_item.source_key,
          "slot" => "head",
          "elvl" => head_item.elvl,
          "primary_stat" => head_item.primary_stat,
          "secondary_stats" => head_item.secondary_stats
        )
        expect(head_json["stats"]).to eq(ItemStats::Raw.call(character_item: head_item).stringify_keys)
      end

      it "respects the slot filter" do
        get "/play/characters/#{character.id}/character_items", params: {slot: "head"}, as: :json
        body = JSON.parse(response.body)
        expect(body.map { |i| i["name"] }).to eq(["Helm of Whatever"])
      end
    end
  end
end
