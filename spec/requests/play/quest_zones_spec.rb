require "rails_helper"

RSpec.describe "Play::QuestZones", type: :request do
  let(:user) { create(:user) }
  let(:character) { create(:character, user:) }
  let(:world) { create(:world) }
  let(:version) { create(:world_version, world:) }

  before { sign_in user }

  def zone_path(zone, char: character) = "/play/characters/#{char.id}/worlds/#{world.id}/quests/zones/#{zone}"

  it "returns a zone's names from its row in the character's world version" do
    create(:zone, world_version: version, identifier: "goblin-cave", name: "Goblin Cave", map_names: {"depths" => "The Depths"})
    create(:world_character, world:, character:, world_version: version)
    get zone_path("goblin-cave")
    expect(response.parsed_body).to eq("identifier" => "goblin-cave", "name" => "Goblin Cave", "map_names" => {"depths" => "The Depths"})
  end

  it "falls back to the identifier for a zone imported without a name" do
    create(:zone, world_version: version, identifier: "darkwood")
    create(:world_character, world:, character:, world_version: version)
    get zone_path("darkwood")
    expect(response.parsed_body).to include("name" => "darkwood", "map_names" => {})
  end

  it "returns 404 for a zone not in the character's version" do
    create(:zone, world_version: create(:world_version, world:), identifier: "elsewhere")
    create(:world_character, world:, character:, world_version: version)
    get zone_path("elsewhere")
    expect(response).to have_http_status(:not_found)
  end

  it "returns 404 for a world the character never entered" do
    get zone_path("darkwood")
    expect(response).to have_http_status(:not_found)
  end

  it "returns 404 for another user's character" do
    get zone_path("darkwood", char: create(:character))
    expect(response).to have_http_status(:not_found)
  end
end
