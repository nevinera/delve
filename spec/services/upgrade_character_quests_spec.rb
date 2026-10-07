require "rails_helper"

RSpec.describe UpgradeCharacterQuests do
  let(:old_version) { create(:world_version) }
  let(:version) do
    create(:world_version, world: old_version.world, quests_path: "worlds/quests.json", quests_sha: Digest::SHA1.hexdigest(body))
  end
  let(:world_character) { create(:world_character, world: version.world, world_version: version) }
  let(:kill) { {"type" => "kill", "zone" => "cave", "unitType" => "rat", "count" => 5} }
  let(:talk) { {"type" => "talk", "zone" => "cave", "ncu" => "grizzle"} }
  let(:quests) { [{"identifier" => "rat-hunt", "objectives" => [kill.merge("count" => 8), talk]}] }
  let(:body) { quests.to_json }

  before { stub_request(:get, version.quests_url).to_return(body:) }

  def quest_on(world_version, identifier = "rat-hunt", progress = {})
    create(:character_quest, world_character:, world_version:, quest_identifier: identifier).tap do |quest|
      quest.record_progress!(progress)
    end
  end

  it "moves quests to the current version, keeping progress only for unchanged objectives" do
    quest = quest_on(old_version, "rat-hunt", QuestObjective.hash_of(kill) => 3, QuestObjective.hash_of(talk) => 1)
    described_class.call(world_character)
    expect(quest.reload.world_version).to eq(version)
    expect(quest.progress).to eq(QuestObjective.hash_of(talk) => 1)
  end

  it "keeps the timer" do
    quest = quest_on(old_version)
    quest.update!(timer_elapsed_seconds: 42)
    described_class.call(world_character)
    expect(quest.reload.timer_elapsed_seconds).to eq(42)
  end

  it "drops quests the version no longer has" do
    quest_on(old_version, "gone")
    described_class.call(world_character)
    expect(world_character.character_quests).to be_empty
  end

  it "upgrades quests whose version was deleted" do
    quest = quest_on(nil)
    described_class.call(world_character)
    expect(quest.reload.world_version).to eq(version)
  end

  it "drops every quest when the version has no quests file" do
    version.update!(quests_path: nil, quests_sha: nil)
    quest_on(old_version)
    described_class.call(world_character)
    expect(world_character.character_quests).to be_empty
  end

  it "doesn't read the quests file when every quest is current" do
    quest_on(version)
    described_class.call(world_character)
    expect(a_request(:get, version.quests_url)).not_to have_been_made
  end

  it "refuses a quests file that changed since import" do
    stub_request(:get, version.quests_url).to_return(body: "[]")
    quest_on(old_version)
    expect { described_class.call(world_character) }.to raise_error(WorldContent::ChecksumMismatch)
  end
end
