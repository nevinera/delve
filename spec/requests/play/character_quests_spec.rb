require "rails_helper"

RSpec.describe "Play::CharacterQuests", type: :request do
  let(:user) { create(:user) }
  let(:character) { create(:character, user:) }
  let(:world) { create(:world) }

  before { sign_in user }

  def quests_path(char: character) = "/play/characters/#{char.id}/worlds/#{world.id}/quests"

  it "lists the character's active quests in this world" do
    world_character = create(:world_character, world:, character:)
    quest = create(:character_quest, world_character:, quest_identifier: "rat-hunt")
    progress = create(:quest_progress, character_quest: quest, position: 0, count: 1)
    other = create(:world_character, character:, world: create(:world, path: "worlds/other.json"))
    create(:character_quest, world_character: other, quest_identifier: "elsewhere")
    get quests_path
    expect(response.parsed_body["quests"]).to eq([{
      "quest_identifier" => "rat-hunt", "world_version_id" => nil, "timer_elapsed_seconds" => 0, "definition" => {},
      "objectives" => [{"hash" => progress.objective_hash, "objective" => progress.objective, "count" => 1, "required" => 1}]
    }])
  end

  it "names the zones of the character's world version" do
    version = create(:world_version, world:)
    create(:zone, world_version: version, identifier: "goblin-cave", name: "Goblin Cave")
    create(:zone, world_version: version, identifier: "darkwood", name: nil)
    create(:world_character, world:, character:, world_version: version)
    get quests_path
    expect(response.parsed_body["zone_names"]).to eq("goblin-cave" => "Goblin Cave", "darkwood" => "darkwood")
  end

  it "is empty for a world the character never entered" do
    get quests_path
    expect(response.parsed_body).to eq("quests" => [], "zone_names" => {})
  end

  it "returns 404 for another user's character" do
    get quests_path(char: create(:character))
    expect(response).to have_http_status(:not_found)
  end
end
