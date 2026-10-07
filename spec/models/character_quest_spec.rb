require "rails_helper"

RSpec.describe CharacterQuest do
  let(:version) { create(:world_version) }
  let(:world_character) { create(:world_character, world: version.world, world_version: version) }

  describe ".accept!" do
    it "starts the quest under the world character's version" do
      quest = described_class.accept!(world_character, "rat-hunt")
      expect(quest).to have_attributes(quest_identifier: "rat-hunt", world_version: version, timer_elapsed_seconds: 0)
    end

    it "returns an already active quest unchanged" do
      first = described_class.accept!(world_character, "rat-hunt")
      expect(described_class.accept!(world_character, "rat-hunt")).to eq(first)
      expect(world_character.character_quests.count).to eq(1)
    end

    it "refuses a completed quest" do
      CharacterFlag.grant!(world_character, "quest/completed/rat-hunt")
      expect { described_class.accept!(world_character, "rat-hunt") }.to raise_error(described_class::AlreadyCompleted)
    end

    it "refuses more than 20 active quests" do
      20.times { |i| described_class.accept!(world_character, "q#{i}") }
      expect { described_class.accept!(world_character, "one-more") }.to raise_error(described_class::TooManyActive)
    end

    it "refuses an invalid identifier" do
      expect { described_class.accept!(world_character, "a/b") }.to raise_error(ActiveRecord::RecordInvalid)
    end
  end

  describe "#record_progress!" do
    it "sets counts absolutely, adding and updating rows" do
      quest = create(:character_quest, world_character:)
      quest.record_progress!("aaa" => 1)
      quest.record_progress!("aaa" => 3, "bbb" => 2)
      expect(quest.reload.progress).to eq("aaa" => 3, "bbb" => 2)
    end

    it "refuses a negative count" do
      quest = create(:character_quest, world_character:)
      expect { quest.record_progress!("aaa" => -1) }.to raise_error(ActiveRecord::RecordInvalid)
    end
  end

  describe "#complete!" do
    it "grants the completion flag and the given flags, and deletes the quest and its progress" do
      quest = create(:character_quest, world_character:, quest_identifier: "rat-hunt")
      create(:quest_progress, character_quest: quest)
      quest.complete!(["custom/grizzle-trusts-you"])
      expect(CharacterFlag.held(world_character, ["quest/completed/rat-hunt", "custom/grizzle-trusts-you"]).size).to eq(2)
      expect(described_class.count).to eq(0)
      expect(QuestProgress.count).to eq(0)
    end

    it "grants nothing when a flag is invalid" do
      quest = create(:character_quest, world_character:, quest_identifier: "rat-hunt")
      expect { quest.complete!(["bogus/x"]) }.to raise_error(ActiveRecord::RecordInvalid)
      expect(world_character.character_flags.count).to eq(0)
      expect(quest.reload).to be_persisted
    end
  end

  describe ".not_on" do
    it "finds quests on other versions or none" do
      other = create(:character_quest, world_character:, world_version: create(:world_version, world: version.world))
      orphaned = create(:character_quest, world_character:, world_version: nil)
      create(:character_quest, world_character:)
      expect(described_class.not_on(version)).to contain_exactly(other, orphaned)
    end
  end
end
