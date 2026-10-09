require "rails_helper"

RSpec.describe Validators::QuestValidator, type: :validator do
  let(:quest) do
    {
      "identifier" => "grizzle-warning",
      "name" => "A Goblin's Warning",
      "chainIdentifier" => "grizzles-troubles",
      "chainName" => "Grizzle's Troubles",
      "offeredBy" => {"zone" => "goblin-cave", "ncu" => "grizzle"},
      "turnIn" => {"zone" => "goblin-cave", "ncu" => "grizzle"},
      "offerText" => "Got any work?",
      "description" => "Clear out those rats.",
      "marker" => true,
      "progressText" => "Still rats down there?",
      "completionText" => "Heh.",
      "requiresFlags" => ["custom/grizzle-likes-you"],
      "grantsFlags" => ["custom/grizzle-trusts-you"],
      "timer" => "5m",
      "objectives" => [
        {"type" => "kill", "text" => "Kill rats", "zone" => "goblin-cave", "unitType" => "rat", "count" => 5, "map" => "entrance"},
        {"type" => "kill", "text" => "Kill the Rat King", "zone" => "goblin-cave", "unit" => "rat-king"},
        {"type" => "talk", "text" => "Talk to Grizzle", "zone" => "goblin-cave", "ncu" => "grizzle", "map" => "entrance"},
        {"type" => "reach", "text" => "Find the depths", "zone" => "goblin-cave", "map" => "depths"},
        {"type" => "reach", "text" => "Find the goblin cave", "zone" => "goblin-cave"}
      ],
      "rewards" => [{"zone" => "goblin-cave", "item" => "rusty-dagger"}]
    }
  end

  def validate!(data = quest) = described_class.validate!(data)

  def expect_invalid(message, data = quest)
    expect { validate!(data) }.to raise_error(Validators::ValidationError, message)
  end

  it "accepts a full quest" do
    expect { validate! }.not_to raise_error
  end

  it "accepts a breadcrumb: no objectives, with a turnIn" do
    expect { validate!(quest.except("objectives")) }.not_to raise_error
  end

  it "accepts objectives without a turnIn" do
    expect { validate!(quest.except("turnIn")) }.not_to raise_error
  end

  it "rejects a quest with neither objectives nor a turnIn" do
    expect_invalid(/at least one objective or a turnIn/, quest.except("turnIn").merge("objectives" => []))
  end

  %w[identifier name chainIdentifier chainName offeredBy offerText description].each do |key|
    it "requires #{key}" do
      expect_invalid(/#{key} is required/, quest.except(key))
    end
  end

  it "accepts a quest without a marker" do
    expect { validate!(quest.except("marker")) }.not_to raise_error
  end

  it "rejects a marker that isn't a boolean" do
    expect_invalid(/marker/, quest.merge("marker" => "yes"))
  end

  it "rejects an empty name" do
    expect_invalid(/name must not be empty/, quest.merge("name" => " "))
  end

  it "rejects an identifier with a slash" do
    expect_invalid(/identifier must be 1-54/, quest.merge("identifier" => "a/b"))
  end

  it "rejects an identifier too long for its completion flag" do
    expect_invalid(/identifier must be 1-54/, quest.merge("identifier" => "a" * 55))
  end

  it "accepts the longest identifier, whose completion flag is valid" do
    validate!(quest.merge("identifier" => "a" * 54))
    expect(CharacterFlag.valid_flag?("quest/completed/#{"a" * 54}")).to be(true)
  end

  it "rejects an NcuRef without an ncu" do
    expect_invalid(/\$\.offeredBy\.ncu/, quest.merge("offeredBy" => {"zone" => "goblin-cave"}))
  end

  it "rejects an invalid flag" do
    expect_invalid(/valid flag.*\$\.requiresFlags\[0\]/, quest.merge("requiresFlags" => ["nope/x"]))
  end

  it "rejects granting a quest flag" do
    expect_invalid(/only granted by completing quests/, quest.merge("grantsFlags" => ["quest/completed/other"]))
  end

  it "allows requiring a quest flag" do
    expect { validate!(quest.merge("requiresFlags" => ["quest/completed/other"])) }.not_to raise_error
  end

  describe "timer" do
    it "accepts seconds and up to 60m" do
      %w[124s 60m 3600s].each { |timer| expect { validate!(quest.merge("timer" => timer)) }.not_to raise_error }
    end

    it "rejects more than 60m, zero, and other formats" do
      %w[61m 3601s 0s 5 5h 1m30s].each { |timer| expect_invalid(/timer must be/, quest.merge("timer" => timer)) }
    end
  end

  describe "objectives" do
    def with_objective(objective) = quest.merge("objectives" => [{"text" => "Do it"}.merge(objective)])

    it "rejects an unknown type" do
      expect_invalid(/must be one of/, with_objective("type" => "escort", "zone" => "goblin-cave"))
    end

    it "requires a zone" do
      expect_invalid(/zone is required/, with_objective("type" => "reach", "map" => "depths"))
    end

    it "requires text" do
      expect_invalid(/text is required/, quest.merge("objectives" => [{"type" => "reach", "zone" => "goblin-cave"}]))
      expect_invalid(/text must not be empty/, with_objective("type" => "reach", "zone" => "goblin-cave", "text" => " "))
    end

    it "requires a talk objective's ncu" do
      expect_invalid(/ncu is required/, with_objective("type" => "talk", "zone" => "goblin-cave"))
    end

    it "requires exactly one of a kill objective's unit or unitType" do
      expect_invalid(/exactly one of unit or unitType/, with_objective("type" => "kill", "zone" => "goblin-cave"))
      both = {"type" => "kill", "zone" => "goblin-cave", "unit" => "a", "unitType" => "b"}
      expect_invalid(/exactly one of unit or unitType/, with_objective(both))
    end

    it "rejects a count below 1" do
      expect_invalid(/count must be at least 1/, with_objective("type" => "kill", "zone" => "z", "unitType" => "rat", "count" => 0))
    end

    it "rejects identical objectives, regardless of key order or text" do
      objective = {"type" => "reach", "text" => "Go down", "zone" => "goblin-cave", "map" => "depths"}
      reordered = {"map" => "depths", "zone" => "goblin-cave", "type" => "reach", "text" => "Go deeper"}
      expect_invalid(/duplicates an earlier objective.*\$\.objectives\[1\]/, quest.merge("objectives" => [objective, reordered]))
    end
  end

  it "requires a reward's item" do
    expect_invalid(/\$\.rewards\[0\]\.item/, quest.merge("rewards" => [{"zone" => "goblin-cave"}]))
  end

  describe ".timer_seconds" do
    it "converts minutes and seconds" do
      expect(described_class.timer_seconds("5m")).to eq(300)
      expect(described_class.timer_seconds("90s")).to eq(90)
      expect(described_class.timer_seconds("x")).to be_nil
    end
  end
end
