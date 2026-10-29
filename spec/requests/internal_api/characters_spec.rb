require "rails_helper"

RSpec.describe "The game server's character API", type: :request do
  let(:world) { create(:world) }
  let(:character) { create(:character, name: "Arwen", look: {"skin" => 3}) }
  let(:path) { "/internal/worlds/#{world.id}/characters/#{character.id}" }
  let(:headers) { {"X-Internal-Token" => "two"} }

  around { |example| with_env("INTERNAL_API_TOKENS" => "one, two") { example.run } }

  it "gives the character entering a world it hasn't played" do
    get(path, headers:)
    expect(response.parsed_body).to eq("id" => character.id, "name" => "Arwen", "look" => {"skin" => 3}, "position" => nil)
  end

  it "keeps where the character is, per world" do
    put("#{path}/position", params: {continent: "main", at: [1.5, 2, -3], yaw: 0.25}, headers:, as: :json)
    expect(response).to have_http_status(:no_content)
    put("#{path}/position", params: {continent: "isle", at: [4, 5, 6], yaw: 1}, headers:, as: :json)

    get(path, headers:)
    expect(response.parsed_body["position"]).to eq("continent" => "isle", "at" => [4.0, 5.0, 6.0], "yaw" => 1.0)
    expect(WorldCharacter.count).to eq(1)

    get("/internal/worlds/#{create(:world).id}/characters/#{character.id}", headers:)
    expect(response.parsed_body["position"]).to be_nil
  end

  it "refuses a position it can't use" do
    put("#{path}/position", params: {continent: "main", at: [1, 2], yaw: 0}, headers:, as: :json)
    expect(response).to have_http_status(:unprocessable_content)
    put("#{path}/position", params: {continent: "", at: [1, 2, 3], yaw: 0}, headers:, as: :json)
    expect(response).to have_http_status(:unprocessable_content)
    expect(WorldCharacter.count).to eq(0)
  end

  it "refuses without the shared token" do
    get path, headers: {"X-Internal-Token" => "wrong"}
    expect(response).to have_http_status(:unauthorized)
    put "#{path}/position", params: {continent: "main", at: [1, 2, 3], yaw: 0}, as: :json
    expect(response).to have_http_status(:unauthorized)
  end
end
