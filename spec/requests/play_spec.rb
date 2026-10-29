require "rails_helper"

RSpec.describe "Playing a world", type: :request do
  let(:user) { create(:user) }
  let(:world) { create(:world, repo: "them/vale", name: "The Vale", released_sha: "c" * 40, released_tag: "v3", released_at: Time.current) }
  let!(:import) { create(:world_import, world:, tag: "v3", sha: "c" * 40, status: "passed", files: {"world.json" => {"sha" => "s", "size" => 9}, "places/continents/main/plates/surface/0_0.plate" => {"sha" => "t", "size" => 99}}) }
  let!(:character) { create(:character, user:, name: "Arwen") }

  before { sign_in user }

  it "lists released worlds for anyone to play" do
    create(:world, name: "Unreleased")
    world
    get worlds_path
    expect(response.body).to include("The Vale")
    expect(response.body).to include(%(href="/play/#{world.id}"))
    expect(response.body).not_to include("Unreleased")
  end

  it "asks which of your characters to play" do
    create(:character, name: "Theirs")
    get play_path(world)
    expect(response.body).to include("Arwen")
    expect(response.body).to include(%(href="/play/#{world.id}?character=#{character.id}"))
    expect(response.body).not_to include("Theirs")
    expect(response.body).not_to include("playConfig")
  end

  it "enters with the released commit, its files and your character's look" do
    character.update!(look: {"skin" => 3})
    get play_path(world, character: character.id)
    config = JSON.parse(response.body[%r{<script type="application/json" id="playConfig">(.*?)</script>}m, 1])
    expect(config).to eq("repo" => "them/vale", "sha" => "c" * 40, "paths" => import.files.keys, "look" => {"skin" => 3})
  end

  it "won't play a world that isn't released" do
    get play_path(create(:world))
    expect(response).to have_http_status(:not_found)
  end

  it "won't play as someone else's character" do
    get play_path(world, character: create(:character, name: "Other").id)
    expect(response).to have_http_status(:not_found)
  end
end
