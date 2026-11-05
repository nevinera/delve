require "rails_helper"

RSpec.describe "The game server's character API", type: :request do
  let(:world) { create(:world) }
  let(:character) { create(:character, name: "Arwen", look: {"skin" => 3}) }
  let(:path) { "/internal/worlds/#{world.id}/characters/#{character.id}" }
  let(:headers) { {"X-Internal-Token" => "two"} }

  around { |example| with_env("INTERNAL_API_TOKENS" => "one, two") { example.run } }

  it "gives the character entering a world it hasn't played" do
    get(path, headers:)
    expect(response.parsed_body).to eq("id" => character.id, "name" => "Arwen", "look" => {"skin" => 3}, "class" => nil, "level" => 1, "specialization" => nil, "talents" => {}, "bars" => nil, "position" => nil, "home" => nil, "systemAdmin" => false)
  end

  it "says when the character's owner is a system admin" do
    character.user.update!(role: "system_admin")
    get(path, headers:)
    expect(response.parsed_body).to include("systemAdmin" => true)
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
    put("#{path}/position", params: {continent: "main", at: [nil, 2, 3], yaw: 0}, headers:, as: :json)
    expect(response).to have_http_status(:unprocessable_content)
    expect(WorldCharacter.count).to eq(0)
  end

  it "keeps the class a character picks, per world, before it has a position" do
    put("#{path}/class", params: {class: "frst0001"}, headers:, as: :json)
    expect(response).to have_http_status(:no_content)

    get(path, headers:)
    expect(response.parsed_body).to include("class" => "frst0001", "position" => nil)

    put("#{path}/position", params: {continent: "main", at: [1, 2, 3], yaw: 0}, headers:, as: :json)
    get(path, headers:)
    expect(response.parsed_body).to include("class" => "frst0001", "position" => {"continent" => "main", "at" => [1.0, 2.0, 3.0], "yaw" => 0.0})
    expect(WorldCharacter.count).to eq(1)

    get("/internal/worlds/#{create(:world).id}/characters/#{character.id}", headers:)
    expect(response.parsed_body["class"]).to be_nil
  end

  it "keeps a position with no class" do
    put("#{path}/position", params: {continent: "main", at: [1, 2, 3], yaw: 0}, headers:, as: :json)
    get(path, headers:)
    expect(response.parsed_body).to include("class" => nil, "position" => {"continent" => "main", "at" => [1.0, 2.0, 3.0], "yaw" => 0.0})
  end

  it "refuses an empty class" do
    put("#{path}/class", params: {class: ""}, headers:, as: :json)
    expect(response).to have_http_status(:unprocessable_content)
    expect(WorldCharacter.count).to eq(0)
  end

  it "refuses without the shared token" do
    get path, headers: {"X-Internal-Token" => "wrong"}
    expect(response).to have_http_status(:unauthorized)
    put "#{path}/position", params: {continent: "main", at: [1, 2, 3], yaw: 0}, as: :json
    expect(response).to have_http_status(:unauthorized)
  end

  it "keeps the specialization and talents it chose" do
    put("#{path}/build", params: {specialization: "guard", talents: {"15" => "both"}}, headers:, as: :json)
    expect(response).to have_http_status(:no_content)

    get(path, headers:)
    expect(response.parsed_body).to include("specialization" => "guard", "talents" => {"15" => "both"})
  end

  it "keeps its level" do
    put("#{path}/level", params: {level: 12}, headers:, as: :json)
    expect(response).to have_http_status(:no_content)

    get(path, headers:)
    expect(response.parsed_body).to include("level" => 12)
  end

  it "won't keep a level below 1" do
    put("#{path}/level", params: {level: 0}, headers:, as: :json)
    expect(response).to have_http_status(:unprocessable_content)
  end

  it "keeps its action bars" do
    put("#{path}/bars", params: {bars: [["a", ""], ["b"]]}, headers:, as: :json)
    expect(response).to have_http_status(:no_content)

    get(path, headers:)
    expect(response.parsed_body).to include("bars" => [["a", ""], ["b"]])
  end

  it "keeps its home rest point" do
    put("#{path}/home", params: {home: "inn"}, headers:, as: :json)
    expect(response).to have_http_status(:no_content)

    get(path, headers:)
    expect(response.parsed_body).to include("home" => "inn")
  end

  it "has no specialization or talents until it chooses" do
    get(path, headers:)
    expect(response.parsed_body).to include("specialization" => nil, "talents" => {})
  end
end
