require "rails_helper"

RSpec.describe Validators::StatusValidator, type: :validator do
  let(:enraged_status) { zone_fixture["unitTypes"]["goblin"]["powers"][1]["effects"][0]["status"] }

  let(:minimal_status) do
    {"name" => "Stunned", "shortName" => "Stun", "treatAs" => "debuff", "stacking" => "replace", "effects" => []}
  end

  describe ".validate!" do
    it "accepts the Enraged status from the fixture" do
      expect { described_class.validate!(enraged_status) }.not_to raise_error
    end

    it "accepts a minimal status with empty effects" do
      expect { described_class.validate!(minimal_status) }.not_to raise_error
    end

    it "accepts maxStacks when stacking is stack" do
      data = minimal_status.merge("stacking" => "stack", "maxStacks" => 5)
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "raises when name is missing" do
      expect { described_class.validate!(minimal_status.except("name")) }
        .to raise_error(Validators::ValidationError, /name is required/)
    end

    it "allows description to be omitted" do
      expect { described_class.validate!(minimal_status.except("description")) }.not_to raise_error
    end

    it "allows description explicitly null, same as omitted" do
      expect { described_class.validate!(minimal_status.merge("description" => nil)) }.not_to raise_error
    end

    it "allows maxStacks explicitly null, same as omitted" do
      expect { described_class.validate!(minimal_status.merge("stacking" => "stack", "maxStacks" => nil)) }.not_to raise_error
    end

    it "allows auraEffect explicitly null, same as omitted" do
      expect { described_class.validate!(minimal_status.merge("auraEffect" => nil)) }.not_to raise_error
    end

    it "accepts a description" do
      data = minimal_status.merge("description" => "Unable to act.")
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "raises when shortName is missing" do
      expect { described_class.validate!(minimal_status.except("shortName")) }
        .to raise_error(Validators::ValidationError, /shortName is required/)
    end

    it "accepts a shortName at exactly the 6 character limit" do
      data = minimal_status.merge("shortName" => "Six6ch")
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "raises when shortName exceeds 6 characters" do
      data = minimal_status.merge("shortName" => "TooLong")
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /shortName must be 6 characters or fewer/)
    end

    it "raises when treatAs is invalid" do
      expect { described_class.validate!(minimal_status.merge("treatAs" => "neutral")) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "raises when stacking is invalid" do
      expect { described_class.validate!(minimal_status.merge("stacking" => "additive")) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "raises when maxStacks is less than 1" do
      data = minimal_status.merge("stacking" => "stack", "maxStacks" => 0)
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /maxStacks must be an integer >= 1/)
    end

    it "raises when maxStacks is not an integer" do
      data = minimal_status.merge("stacking" => "stack", "maxStacks" => 2.5)
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /maxStacks must be an integer >= 1/)
    end

    it "allows auraEffect to be omitted" do
      expect { described_class.validate!(minimal_status.except("auraEffect")) }.not_to raise_error
    end

    it "accepts an auraEffect" do
      data = minimal_status.merge("auraEffect" => {"sourceURL" => "https://example.com/fx/aura.webp"})
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "propagates errors from an invalid auraEffect with path context" do
      data = minimal_status.merge("auraEffect" => {})
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError) { |e| expect(e.path).to match(/auraEffect/) }
    end

    it "raises when effects is missing" do
      expect { described_class.validate!(minimal_status.except("effects")) }
        .to raise_error(Validators::ValidationError, /effects is required/)
    end

    it "propagates errors from nested status effects with path context" do
      data = minimal_status.merge("effects" => [{"type" => "stat"}])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError) { |e| expect(e.path).to match(/effects\[0\]/) }
    end
  end
end
