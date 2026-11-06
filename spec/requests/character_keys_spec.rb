require "rails_helper"

RSpec.describe "A character's play keys", type: :request do
  let(:user) { create(:user) }
  let(:character) { create(:character, user:, name: "Arwen") }

  before { sign_in user }

  it "keeps the keys it's changed" do
    patch character_keys_path(character), params: {keys: {jump: "KeyJ", forward: ""}}, as: :json
    expect(response).to have_http_status(:no_content)
    expect(character.reload.keys).to eq({"jump" => "KeyJ", "forward" => ""})
  end

  it "won't keep keys that aren't actions to combos, or too many" do
    patch character_keys_path(character), params: {keys: {jump: 3}}, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    patch character_keys_path(character), params: {keys: "KeyJ"}, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    patch character_keys_path(character), params: {keys: (1..400).to_h { |n| ["action#{n}", "KeyJ"] }}, as: :json
    expect(response).to have_http_status(:unprocessable_entity)
    expect(character.reload.keys).to eq({})
  end

  it "is only for your own characters" do
    theirs = create(:character, name: "Boromir")
    patch character_keys_path(theirs), params: {keys: {jump: "KeyJ"}}, as: :json
    expect(response).to have_http_status(:not_found)
    expect(theirs.reload.keys).to eq({})
  end

  it "gives the play page the character's keys" do
    character.update!(keys: {"jump" => "KeyJ"})
    world = create(:world, released_sha: "c" * 40, released_tag: "v1", released_at: Time.current)
    create(:world_import, world:, tag: "v1", sha: "c" * 40, status: "passed", files: {"world.json" => {"sha" => "s", "size" => 9}})
    get play_path(world, character: character.id)
    config = JSON.parse(Nokogiri::HTML(response.body).at_css("#playConfig").text)
    expect([config["keys"], config["keysUrl"]]).to eq([{"jump" => "KeyJ"}, character_keys_path(character)])
  end
end
