require "rails_helper"

RSpec.describe CharacterQuest do
  let(:version) { create(:world_version) }
  let(:world_character) { create(:world_character, world: version.world, world_version: version) }
  let(:kill) { {"type" => "kill", "zone" => "cave", "unitType" => "rat", "count" => 5} }
  let(:talk) { {"type" => "talk", "zone" => "cave", "ncu" => "grizzle"} }
  let(:definition) do
    {
      "identifier" => "rat-hunt", "name" => "Rat Hunt", "chainIdentifier" => "hunts", "chainName" => "Hunts",
      "offeredBy" => {"zone" => "cave", "ncu" => "grizzle"}, "offerText" => "Rats!", "description" => "Kill rats.",
      "grantsFlags" => ["custom/brave"], "timer" => "5m", "objectives" => [kill, talk]
    }
  end

  describe ".accept!" do
    it "keeps the quest's structure, not its prose, under the world character's version" do
      quest = described_class.accept!(world_character, definition)
      expect(quest).to have_attributes(quest_identifier: "rat-hunt", world_version: version, timer_elapsed_seconds: 0)
      expect(quest.definition).to eq(
        "chainIdentifier" => "hunts", "offeredBy" => {"zone" => "cave", "ncu" => "grizzle"},
        "grantsFlags" => ["custom/brave"], "timer" => "5m"
      )
    end

    it "makes a progress row per objective, in order" do
      quest = described_class.accept!(world_character, definition)
      expect(quest.quest_progresses.map { |p| [p.position, p.objective, p.objective_hash, p.count, p.required] }).to eq([
        [0, kill, QuestObjective.hash_of(kill), 0, 5],
        [1, talk, QuestObjective.hash_of(talk), 0, 1]
      ])
    end

    it "returns an already active quest unchanged" do
      first = described_class.accept!(world_character, definition)
      expect(described_class.accept!(world_character, definition.merge("timer" => "1m"))).to eq(first)
      expect(first.reload.definition["timer"]).to eq("5m")
    end

    it "refuses a completed quest" do
      CharacterFlag.grant!(world_character, "quest/completed/rat-hunt")
      expect { described_class.accept!(world_character, definition) }.to raise_error(described_class::AlreadyCompleted)
    end

    it "refuses more than 20 active quests" do
      20.times { |i| described_class.accept!(world_character, definition.merge("identifier" => "q#{i}")) }
      expect { described_class.accept!(world_character, definition) }.to raise_error(described_class::TooManyActive)
    end

    it "refuses an invalid identifier, leaving nothing behind" do
      expect { described_class.accept!(world_character, definition.merge("identifier" => "a/b")) }.to raise_error(ActiveRecord::RecordInvalid)
      expect(QuestProgress.count).to eq(0)
    end
  end

  describe "#sync!" do
    let(:newer) { create(:world_version, world: version.world) }
    let(:quest) { described_class.accept!(world_character, definition) }

    before do
      quest.record_progress!(QuestObjective.hash_of(kill) => 3, QuestObjective.hash_of(talk) => 1)
      world_character.update!(world_version: newer)
    end

    it "keeps progress on unchanged objectives, in their new order, and starts changed ones over" do
      changed = kill.merge("count" => 8)
      quest.sync!(definition.merge("objectives" => [talk, changed], "timer" => "10m"))
      expect(quest.reload).to have_attributes(world_version: newer, definition: include("timer" => "10m"))
      expect(quest.quest_progresses.map { |p| [p.position, p.objective, p.count] }).to eq([[0, talk, 1], [1, changed, 0]])
    end

    it "keeps the timer" do
      quest.update!(timer_elapsed_seconds: 42)
      quest.sync!(definition)
      expect(quest.reload.timer_elapsed_seconds).to eq(42)
    end
  end

  describe "#record_progress!" do
    let(:quest) { described_class.accept!(world_character, definition) }

    it "sets counts absolutely" do
      quest.record_progress!(QuestObjective.hash_of(kill) => 1)
      quest.record_progress!(QuestObjective.hash_of(kill) => 3)
      expect(quest.quest_progresses.reload.first.count).to eq(3)
    end

    it "refuses an objective the quest doesn't have" do
      expect { quest.record_progress!("nope" => 1) }.to raise_error(described_class::UnknownObjective)
    end

    it "refuses a negative count" do
      expect { quest.record_progress!(QuestObjective.hash_of(kill) => -1) }.to raise_error(ActiveRecord::RecordInvalid)
    end
  end

  describe "#complete!" do
    it "grants the completion flag and the quest's flags, and deletes the quest and its progress" do
      quest = described_class.accept!(world_character, definition)
      expect(quest.complete!).to eq(flags: ["quest/completed/rat-hunt", "custom/brave"], items: [])
      expect(CharacterFlag.held(world_character, ["quest/completed/rat-hunt", "custom/brave"]).size).to eq(2)
      expect(described_class.count).to eq(0)
      expect(QuestProgress.count).to eq(0)
    end

    context "with rewards" do
      let(:dagger) { {"name" => "Rusty Dagger", "slot" => "main_hand", "elvl" => 1, "primary" => "strength"} }
      let(:version) do
        files = demo_world_files
        files[:zones]["cave"] = cave_zone_file.merge("items" => {"rusty-dagger" => dagger})
        published_world(files:)
      end

      it "awards each reward item from its zone" do
        quest = described_class.accept!(world_character, definition.merge("rewards" => [{"zone" => "cave", "item" => "rusty-dagger"}]))
        expect(quest.complete![:items]).to eq([{identifier: "rusty-dagger", name: "Rusty Dagger"}])
        expect(world_character.character_items.pluck(:identifier, :world_version_id)).to eq([["rusty-dagger", version.id]])
      end

      it "skips a reward already held in this version" do
        rewards = [{"zone" => "cave", "item" => "rusty-dagger"}]
        described_class.accept!(world_character, definition.merge("identifier" => "first", "rewards" => rewards)).complete!
        quest = described_class.accept!(world_character, definition.merge("rewards" => rewards))
        expect(quest.complete![:items]).to eq([])
        expect(world_character.character_items.count).to eq(1)
      end

      it "grants nothing when a reward can't be found" do
        quest = described_class.accept!(world_character, definition.merge("rewards" => [{"zone" => "cave", "item" => "gold"}]))
        expect { quest.complete! }.to raise_error(ActiveRecord::RecordNotFound)
        expect(world_character.character_flags.count).to eq(0)
        expect(quest.reload).to be_persisted
      end
    end
  end
end
