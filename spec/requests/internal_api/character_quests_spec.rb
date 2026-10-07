require "rails_helper"

RSpec.describe "InternalApi::CharacterQuests", type: :request do
  let(:version) { create(:world_version) }
  let(:world_character) { create(:world_character, world: version.world, world_version: version) }
  let(:headers) { {"X-Internal-Token" => "test-token"} }
  let(:talk) { {"type" => "talk", "zone" => "cave", "ncu" => "grizzle"} }
  let(:talk_hash) { QuestObjective.hash_of(talk) }
  let(:definition) do
    {"identifier" => "rat-hunt", "name" => "Rat Hunt", "chainIdentifier" => "hunts", "offerText" => "Rats!",
     "offeredBy" => {"zone" => "cave", "ncu" => "grizzle"}, "objectives" => [talk]}
  end

  before do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("INTERNAL_API_TOKENS", "").and_return("test-token")
  end

  def base = "/internal_api/world_characters/#{world_character.id}/quests"

  def active_quest = CharacterQuest.accept!(world_character, definition)

  let(:quest_json) do
    {
      "quest_identifier" => "rat-hunt", "world_version_id" => version.id.to_s, "timer_elapsed_seconds" => 0,
      "definition" => {"chainIdentifier" => "hunts", "offeredBy" => {"zone" => "cave", "ncu" => "grizzle"}},
      "objectives" => [{"hash" => talk_hash, "objective" => talk, "count" => 0, "required" => 1}]
    }
  end

  describe "GET index" do
    it "lists active quests with their structure and progress" do
      active_quest
      get(base, headers:)
      expect(response.parsed_body).to eq("quests" => [quest_json])
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
    it "accepts the quest from its definition" do
      post(base, params: {quest: definition}, headers:, as: :json)
      expect(response).to have_http_status(:created)
      expect(response.parsed_body["quest"]).to eq(quest_json)
    end

    it "refuses a completed quest" do
      CharacterFlag.grant!(world_character, "quest/completed/rat-hunt")
      post(base, params: {quest: definition}, headers:, as: :json)
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["error"]).to match(/already completed/)
    end

    it "refuses an invalid identifier" do
      post(base, params: {quest: definition.merge("identifier" => "a/b")}, headers:, as: :json)
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "refuses a quest that isn't a definition" do
      post(base, params: {quest: "rat-hunt"}, headers:, as: :json)
      expect(response).to have_http_status(:bad_request)
    end
  end

  describe "POST sync" do
    it "moves the quest to a newer definition" do
      active_quest.record_progress!(talk_hash => 1)
      reach = {"type" => "reach", "zone" => "cave", "map" => "depths"}
      post("#{base}/rat-hunt/sync", params: {quest: definition.merge("objectives" => [reach, talk])}, headers:, as: :json)
      expect(response.parsed_body["quest"]["objectives"].map { |o| [o["objective"], o["count"]] }).to eq([[reach, 0], [talk, 1]])
    end

    it "returns 404 for a quest that isn't active" do
      post("#{base}/rat-hunt/sync", params: {quest: definition}, headers:, as: :json)
      expect(response).to have_http_status(:not_found)
    end
  end

  describe "PATCH update" do
    it "sets progress and the timer" do
      active_quest
      patch("#{base}/rat-hunt", params: {progress: {talk_hash => 1}, timer_elapsed_seconds: 90}, headers:, as: :json)
      expect(response.parsed_body["quest"]).to include("timer_elapsed_seconds" => 90, "objectives" => [include("count" => 1)])
    end

    it "refuses an unknown objective" do
      active_quest
      patch("#{base}/rat-hunt", params: {progress: {"nope" => 1}}, headers:, as: :json)
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "returns 404 for a quest that isn't active" do
      patch("#{base}/rat-hunt", params: {progress: {talk_hash => 1}}, headers:, as: :json)
      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST complete" do
    it "grants the flags and ends the quest" do
      active_quest
      post("#{base}/rat-hunt/complete", params: {grants_flags: ["custom/brave"]}, headers:, as: :json)
      expect(response.parsed_body).to eq("flags" => ["quest/completed/rat-hunt", "custom/brave"])
      expect(world_character.character_quests.reload).to be_empty
      expect(CharacterFlag.held?(world_character, "custom/brave")).to be(true)
    end

    it "refuses invalid flags, leaving the quest active" do
      active_quest
      post("#{base}/rat-hunt/complete", params: {grants_flags: ["bogus/x"]}, headers:, as: :json)
      expect(response).to have_http_status(:unprocessable_content)
      expect(world_character.character_quests.reload.count).to eq(1)
    end
  end

  describe "DELETE destroy" do
    it "fails the quest" do
      active_quest
      delete("#{base}/rat-hunt", headers:)
      expect(response).to have_http_status(:no_content)
      expect(world_character.character_quests.reload).to be_empty
    end

    it "is idempotent" do
      delete("#{base}/rat-hunt", headers:)
      expect(response).to have_http_status(:no_content)
    end
  end
end
