require "rails_helper"

RSpec.describe "InternalApi::CharacterQuests", type: :request do
  let(:version) { create(:world_version) }
  let(:world_character) { create(:world_character, world: version.world, world_version: version) }
  let(:headers) { {"X-Internal-Token" => "test-token"} }

  before do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("INTERNAL_API_TOKENS", "").and_return("test-token")
  end

  def base = "/internal_api/world_characters/#{world_character.id}/quests"

  def active_quest(identifier = "rat-hunt") = create(:character_quest, world_character:, quest_identifier: identifier)

  describe "GET index" do
    it "lists active quests with their progress and timer" do
      active_quest.tap { |q| q.update!(timer_elapsed_seconds: 30) }.record_progress!("abc" => 2)
      get(base, headers:)
      expect(response.parsed_body).to eq("quests" => [
        {"quest_identifier" => "rat-hunt", "timer_elapsed_seconds" => 30, "progress" => {"abc" => 2}}
      ])
    end

    it "needs the internal token" do
      get base
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns 404 for an unknown world character" do
      get("/internal_api/world_characters/0/quests", headers:)
      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST create" do
    it "accepts the quest" do
      post(base, params: {quest: "rat-hunt"}, headers:, as: :json)
      expect(response).to have_http_status(:created)
      expect(response.parsed_body["quest"]).to include("quest_identifier" => "rat-hunt")
      expect(world_character.character_quests.pluck(:quest_identifier)).to eq(["rat-hunt"])
    end

    it "refuses a completed quest" do
      CharacterFlag.grant!(world_character, "quest/completed/rat-hunt")
      post(base, params: {quest: "rat-hunt"}, headers:, as: :json)
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["error"]).to match(/already completed/)
    end

    it "refuses an invalid identifier" do
      post(base, params: {quest: "a/b"}, headers:, as: :json)
      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "PATCH update" do
    it "sets progress and the timer" do
      active_quest
      patch("#{base}/rat-hunt", params: {progress: {"abc" => 4}, timer_elapsed_seconds: 90}, headers:, as: :json)
      expect(response.parsed_body["quest"]).to eq("quest_identifier" => "rat-hunt", "timer_elapsed_seconds" => 90, "progress" => {"abc" => 4})
    end

    it "returns 404 for a quest that isn't active" do
      patch("#{base}/rat-hunt", params: {progress: {"abc" => 4}}, headers:, as: :json)
      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST complete" do
    it "grants the flags and ends the quest" do
      active_quest
      post("#{base}/rat-hunt/complete", params: {grants_flags: ["custom/brave"]}, headers:, as: :json)
      expect(response.parsed_body).to eq("flags" => ["quest/completed/rat-hunt", "custom/brave"])
      expect(world_character.character_quests).to be_empty
      expect(CharacterFlag.held?(world_character, "custom/brave")).to be(true)
    end

    it "refuses invalid flags, leaving the quest active" do
      active_quest
      post("#{base}/rat-hunt/complete", params: {grants_flags: ["bogus/x"]}, headers:, as: :json)
      expect(response).to have_http_status(:unprocessable_content)
      expect(world_character.character_quests.count).to eq(1)
    end
  end

  describe "DELETE destroy" do
    it "fails the quest" do
      active_quest
      delete("#{base}/rat-hunt", headers:)
      expect(response).to have_http_status(:no_content)
      expect(world_character.character_quests).to be_empty
    end

    it "is idempotent" do
      delete("#{base}/rat-hunt", headers:)
      expect(response).to have_http_status(:no_content)
    end
  end
end
