require "rails_helper"

RSpec.describe Game::EntryToken do
  let(:world) { create(:world, repo: "them/vale", released_sha: "c" * 40) }
  let(:character) { create(:character) }
  let(:now) { Time.zone.parse("2026-10-29 12:00:00") }

  it "signs who's entering which world, for 5 minutes" do
    body, signature = with_env("GAME_TOKEN_SECRET" => nil) { described_class.issue(character:, world:, now:).split(".") }
    expect(JSON.parse(Base64.urlsafe_decode64(body))).to eq(
      "user" => character.user_id, "character" => character.id, "world" => world.id,
      "repo" => "them/vale", "sha" => "c" * 40, "exp" => (now + 5.minutes).to_i
    )
    expect(Base64.urlsafe_decode64(signature)).to eq(OpenSSL::HMAC.digest("SHA256", described_class::LOCAL_SECRET, body))
  end

  it "asks for the spawn point only when told to" do
    body = described_class.issue(character:, world:, now:, spawn: true).split(".").first
    expect(JSON.parse(Base64.urlsafe_decode64(body))).to include("spawn" => true)
  end

  it "uses GAME_TOKEN_SECRET when it's set" do
    body, signature = with_env("GAME_TOKEN_SECRET" => "shh") { described_class.issue(character:, world:, now:).split(".") }
    expect(Base64.urlsafe_decode64(signature)).to eq(OpenSSL::HMAC.digest("SHA256", "shh", body))
  end

  it "gives the game server's address as a websocket URL" do
    with_env("GAME_SERVER_PUBLIC_URL" => "https://game.example.com/") do
      expect(described_class.server_url).to eq("wss://game.example.com")
    end
  end
end
