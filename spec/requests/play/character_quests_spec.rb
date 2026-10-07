require "rails_helper"

RSpec.describe "Play::CharacterQuests", type: :request do
  let(:user) { create(:user) }
  let(:character) { create(:character, user:) }
  let(:world) { create(:world) }

  before { sign_in user }

  def quests_path(char: character) = "/play/characters/#{char.id}/worlds/#{world.id}/quests"

  it "lists the character's active quests in this world" do
    world_character = create(:world_character, world:, character:)
    create(:character_quest, world_character:, quest_identifier: "rat-hunt").record_progress!("abc" => 1)
    other = create(:world_character, character:, world: create(:world, path: "worlds/other.json"))
    create(:character_quest, world_character: other, quest_identifier: "elsewhere")
    get quests_path
    expect(response.parsed_body).to eq("quests" => [
      {"quest_identifier" => "rat-hunt", "timer_elapsed_seconds" => 0, "progress" => {"abc" => 1}}
    ])
  end

  it "is empty for a world the character never entered" do
    get quests_path
    expect(response.parsed_body).to eq("quests" => [])
  end

  it "returns 404 for another user's character" do
    get quests_path(char: create(:character))
    expect(response).to have_http_status(:not_found)
  end
end
