require "rails_helper"

RSpec.describe Validators::UnitTypeValidator, type: :validator do
  describe ".validate!" do
    it "accepts the goblin unit type from the fixture" do
      expect { described_class.validate!(goblin_unit_type) }.not_to raise_error
    end

    it "accepts the goblin boss with priorityRotation tactics" do
      expect { described_class.validate!(goblin_boss_unit_type) }.not_to raise_error
    end

    it "raises when name is missing" do
      expect { described_class.validate!(goblin_unit_type.except("name")) }
        .to raise_error(Validators::ValidationError, /name is required/)
    end

    it "raises when tokenImageUrl is missing" do
      expect { described_class.validate!(goblin_unit_type.except("tokenImageUrl")) }
        .to raise_error(Validators::ValidationError, /tokenImageUrl is required/)
    end

    it "raises when tokenImageUrl is neither a string nor an array of strings" do
      expect { described_class.validate!(goblin_unit_type.merge("tokenImageUrl" => 42)) }
        .to raise_error(Validators::ValidationError, /tokenImageUrl must be a string or array of strings/)
    end

    it "accepts tokenImageUrl as a single string" do
      data = goblin_unit_type.merge("tokenImageUrl" => "https://example.com/token.webp")
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "raises when tokenRadius is below 1.0" do
      expect { described_class.validate!(goblin_unit_type.merge("tokenRadius" => 0.5)) }
        .to raise_error(Validators::ValidationError, /tokenRadius must be between/)
    end

    it "raises when tokenRadius is above 20.0" do
      expect { described_class.validate!(goblin_unit_type.merge("tokenRadius" => 21.0)) }
        .to raise_error(Validators::ValidationError, /tokenRadius must be between/)
    end

    it "raises when speedFactor is out of range" do
      expect { described_class.validate!(goblin_unit_type.merge("speedFactor" => 11.0)) }
        .to raise_error(Validators::ValidationError, /speedFactor must be between/)
    end

    it "raises when maxHP is not an integer" do
      expect { described_class.validate!(goblin_unit_type.merge("maxHP" => 20.5)) }
        .to raise_error(Validators::ValidationError, /maxHP must be an integer/)
    end

    it "raises when resource is an AssetReference" do
      data = goblin_unit_type.merge("resource" => {"$ref" => "resources/energy.json", "referenceTo" => "resource_type"})
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /full JSON required/)
    end

    it "raises when a power is an AssetReference" do
      data = goblin_unit_type.merge("powers" => [{"$ref" => "powers/stab.json", "referenceTo" => "power"}])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /full JSON required/)
    end

    it "raises when targeting type is invalid" do
      data = goblin_unit_type.merge("targeting" => {"type" => "random"})
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "raises when tactics type is invalid" do
      data = goblin_unit_type.merge("tactics" => {"type" => "chaos"})
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "accepts scripted tactics" do
      data = goblin_unit_type.merge("tactics" => {
        "type" => "scripted",
        "duration" => 5.0,
        "events" => [{"power" => "Stab", "at" => 1.0}]
      })
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "accepts phased tactics" do
      data = goblin_unit_type.merge("tactics" => {
        "type" => "phased",
        "phases" => [
          {"tactics" => {"type" => "randomAvailable"}, "transition" => {"healthBelow" => 0.5}},
          {"tactics" => {"type" => "priorityRotation", "powers" => ["Enrage", "Stab"]}}
        ]
      })
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "raises when phased tactics are nested" do
      data = goblin_unit_type.merge("tactics" => {
        "type" => "phased",
        "phases" => [
          {"tactics" => {"type" => "phased", "phases" => []}, "transition" => {"healthBelow" => 0.5}},
          {"tactics" => {"type" => "randomAvailable"}}
        ]
      })
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "raises when phased has fewer than 2 phases" do
      data = goblin_unit_type.merge("tactics" => {
        "type" => "phased",
        "phases" => [{"tactics" => {"type" => "randomAvailable"}}]
      })
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /at least 2 elements/)
    end
  end
end
