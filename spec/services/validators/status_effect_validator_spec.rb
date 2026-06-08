require "rails_helper"

RSpec.describe Validators::StatusEffectValidator, type: :validator do
  let(:stat_effect) do
    {"type" => "stat", "statName" => "damageDone", "modifierType" => "multiply", "amount" => 1.1}
  end

  let(:recurring_effect) do
    {"type" => "recurring", "tickRate" => 2.0, "onTick" => "harm", "amount" => 5.0}
  end

  describe ".validate!" do
    it "accepts a valid stat effect" do
      expect { described_class.validate!(stat_effect) }.not_to raise_error
    end

    it "accepts a none effect" do
      expect { described_class.validate!({"type" => "none"}) }.not_to raise_error
    end

    it "accepts a recurring effect" do
      expect { described_class.validate!(recurring_effect) }.not_to raise_error
    end

    it "includes the path in error messages" do
      expect { described_class.validate!({}, path: "$.effects[0]") }
        .to raise_error(Validators::ValidationError) { |e| expect(e.path).to include("$.effects[0]") }
    end

    context "when type is missing" do
      it "raises" do
        expect { described_class.validate!({}) }
          .to raise_error(Validators::ValidationError, /type is required/)
      end
    end

    context "when type is invalid" do
      it "raises" do
        expect { described_class.validate!({"type" => "bad"}) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end
    end

    context "for stat effects" do
      it "raises when statName is missing" do
        data = stat_effect.except("statName")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /statName is required/)
      end

      it "raises when modifierType is invalid" do
        data = stat_effect.merge("modifierType" => "scale")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end

      it "raises when amount is not a number" do
        data = stat_effect.merge("amount" => "big")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be a number/)
      end
    end

    context "for recurring effects" do
      it "raises when tickRate is missing" do
        data = recurring_effect.except("tickRate")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /tickRate is required/)
      end

      it "raises when onTick is invalid" do
        data = recurring_effect.merge("onTick" => "shock")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end
    end

    context "when data is an AssetReference" do
      it "raises with full JSON required message" do
        expect { described_class.validate!({"$ref" => "effects/foo.json", "referenceTo" => "status_effect"}) }
          .to raise_error(Validators::ValidationError, /full JSON required/)
      end
    end
  end
end
