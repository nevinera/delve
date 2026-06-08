require "rails_helper"

RSpec.describe Validators::StatusValidator, type: :validator do
  let(:enraged_status) { zone_fixture["unitTypes"]["goblin"]["powers"][1]["effects"][0]["status"] }

  let(:minimal_status) do
    {"name" => "Stunned", "treatAs" => "debuff", "stacking" => "replace", "effects" => []}
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
