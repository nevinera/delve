require "rails_helper"

RSpec.describe "The game server's character API", type: :request do
  let(:world) { create(:world) }
  let(:character) { create(:character, name: "Arwen", look: {"skin" => 3}) }
  let(:path) { "/internal/worlds/#{world.id}/characters/#{character.id}" }

  around { |example| with_env("INTERNAL_API_TOKENS" => "one, two") { example.run } }

  it "gives the character entering a world" do
    get path, headers: {"X-Internal-Token" => "two"}
    expect(response.parsed_body).to eq("id" => character.id, "name" => "Arwen", "look" => {"skin" => 3}, "position" => nil)
  end

  it "refuses without the shared token" do
    get path, headers: {"X-Internal-Token" => "wrong"}
    expect(response).to have_http_status(:unauthorized)
    get path
    expect(response).to have_http_status(:unauthorized)
  end
end
