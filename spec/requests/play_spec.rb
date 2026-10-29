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
    with_env("GAME_SERVER_PUBLIC_URL" => nil) { get play_path(world, character: character.id) }
    config = JSON.parse(response.body[%r{<script type="application/json" id="playConfig">(.*?)</script>}m, 1])
    game = config.delete("game")
    expect(config).to eq("repo" => "them/vale", "sha" => "c" * 40, "paths" => import.files.keys, "look" => {"skin" => 3})
    expect(game["url"]).to eq("ws://localhost:8090")
    expect(JSON.parse(Base64.urlsafe_decode64(game["token"].split(".").first))).to include("character" => character.id, "world" => world.id)
  end

  it "won't play a world that isn't released" do
    get play_path(create(:world))
    expect(response).to have_http_status(:not_found)
  end

  it "won't play as someone else's character" do
    get play_path(world, character: create(:character, name: "Other").id)
    expect(response).to have_http_status(:not_found)
  end

  describe "previewing an import" do
    let(:owned) { create(:world, user:, repo: "me/draft") }
    let!(:draft) { create(:world_import, world: owned, tag: "v2", sha: "d" * 40, status: "passed", files: {"world.json" => {"sha" => "s", "size" => 9}}) }

    it "lets the owner play an import that passed before it's released" do
      get play_path(owned, import: draft.id)
      expect(response.body).to include("Previewing v2")
      expect(response.body).to include(%(href="/play/#{owned.id}?character=#{character.id}&amp;import=#{draft.id}"))

      get play_path(owned, character: character.id, import: draft.id)
      config = JSON.parse(response.body[%r{<script type="application/json" id="playConfig">(.*?)</script>}m, 1])
      expect(config).to include("repo" => "me/draft", "sha" => "d" * 40, "paths" => ["world.json"])
      expect(JSON.parse(Base64.urlsafe_decode64(config["game"]["token"].split(".").first))).to include("sha" => "d" * 40)
    end

    it "won't preview someone else's world" do
      get play_path(world, import: import.id)
      expect(response).to have_http_status(:not_found)
    end

    it "won't preview an import that didn't pass" do
      failed = create(:world_import, world: owned, tag: "v3", sha: "e" * 40, status: "failed")
      get play_path(owned, import: failed.id)
      expect(response).to have_http_status(:not_found)
    end

    it "is offered on the world's page" do
      get world_path(owned)
      expect(response.body).to include(%(href="/play/#{owned.id}?import=#{draft.id}"))
    end
  end
end
