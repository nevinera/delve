require "rails_helper"

RSpec.describe "Play::CharacterFlags", type: :request do
  let(:user) { create(:user) }
  let(:character) { create(:character, user:) }
  let(:world) { create(:world) }

  before { sign_in user }

  def flag_path(flag, char: character) = "/play/characters/#{char.id}/worlds/#{world.id}/flags/#{flag}"

  it "says whether the character holds the flag in this world" do
    world_character = create(:world_character, world:, character:)
    create(:character_flag, world_character:, flag_type: "quest", identifier: "completed/killMoreOrcs")
    get flag_path("quest/completed/killMoreOrcs")
    expect(response.parsed_body).to eq("held" => true)
    get flag_path("quest/completed/killmoreorcs")
    expect(response.parsed_body).to eq("held" => false)
  end

  it "doesn't count the same flag held in another world" do
    other = create(:world_character, character:, world: create(:world, path: "worlds/other.json"))
    create(:character_flag, world_character: other, flag_type: "key", identifier: "gate")
    create(:world_character, world:, character:)
    get flag_path("key/gate")
    expect(response.parsed_body).to eq("held" => false)
  end

  it "is false for a world the character never entered" do
    get flag_path("key/gate")
    expect(response.parsed_body).to eq("held" => false)
  end

  it "refuses an invalid flag" do
    get flag_path("bogus/gate")
    expect(response).to have_http_status(:unprocessable_content)
  end

  it "returns 404 for another user's character" do
    get flag_path("key/gate", char: create(:character))
    expect(response).to have_http_status(:not_found)
  end
end
