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

      it "raises when statName is not a recognized value" do
        data = stat_effect.merge("statName" => "sneakiness")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end

      it "accepts every Tier 1 (input) stat name" do
        Validators::StatusEffectValidator::INPUT_STAT_NAMES.each do |name|
          data = stat_effect.merge("statName" => name)
          expect { described_class.validate!(data) }.not_to raise_error
        end
      end

      it "accepts every Tier 2 (output) stat name" do
        Validators::StatusEffectValidator::OUTPUT_STAT_NAMES.each do |name|
          data = stat_effect.merge("statName" => name)
          expect { described_class.validate!(data) }.not_to raise_error
        end
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

      it "allows school to be omitted" do
        expect { described_class.validate!(recurring_effect.except("school")) }.not_to raise_error
      end

      it "allows school explicitly null, same as omitted" do
        expect { described_class.validate!(recurring_effect.merge("school" => nil)) }.not_to raise_error
      end

      it "allows school magic" do
        expect { described_class.validate!(recurring_effect.merge("school" => "magic")) }.not_to raise_error
      end

      it "raises when school is not a recognized value" do
        expect { described_class.validate!(recurring_effect.merge("school" => "fire")) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end
    end

    context "for triggered effects" do
      let(:triggered_effect) do
        {
          "type" => "triggered",
          "trigger" => {"type" => "healthBelow", "threshold" => 20.0},
          "internalCooldown" => 3.0,
          "effect" => {"type" => "heal", "affects" => "self", "amount" => 15.0}
        }
      end

      it "accepts a valid triggered effect" do
        expect { described_class.validate!(triggered_effect) }.not_to raise_error
      end

      it "accepts every trigger type" do
        Validators::StatusEffectValidator::TRIGGER_TYPE_OPTIONS.each do |type|
          trigger = {"type" => type}
          trigger["threshold"] = 20.0 if Validators::StatusEffectValidator::HEALTH_TRIGGER_TYPE_OPTIONS.include?(type)
          data = triggered_effect.merge("trigger" => trigger)
          expect { described_class.validate!(data) }.not_to raise_error
        end
      end

      it "raises when trigger is missing" do
        data = triggered_effect.except("trigger")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /trigger is required/)
      end

      it "raises when trigger type is invalid" do
        data = triggered_effect.merge("trigger" => {"type" => "moonPhase"})
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end

      it "raises when a health trigger is missing threshold" do
        data = triggered_effect.merge("trigger" => {"type" => "healthBelow"})
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /threshold is required/)
      end

      it "raises when a health trigger's threshold is out of range" do
        data = triggered_effect.merge("trigger" => {"type" => "healthBelow", "threshold" => 150})
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /threshold must be between 0 and 100/)
      end

      it "does not require a threshold for takesDamage/dealsDamage" do
        data = triggered_effect.merge("trigger" => {"type" => "takesDamage"})
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "raises when internalCooldown is missing" do
        data = triggered_effect.except("internalCooldown")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /internalCooldown is required/)
      end

      it "raises when internalCooldown is negative" do
        data = triggered_effect.merge("internalCooldown" => -1)
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /internalCooldown must be non-negative/)
      end

      it "accepts internalCooldown of 0" do
        expect { described_class.validate!(triggered_effect.merge("internalCooldown" => 0)) }.not_to raise_error
      end

      it "raises when effect is missing" do
        data = triggered_effect.except("effect")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /effect is required/)
      end

      it "propagates the nested effect's own validation errors" do
        data = triggered_effect.merge("effect" => triggered_effect["effect"].except("amount"))
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /amount is required/)
      end
    end

    context "condition" do
      it "accepts an effect with no condition" do
        expect { described_class.validate!(stat_effect) }.not_to raise_error
      end

      it "raises when condition type is missing" do
        data = stat_effect.merge("condition" => {})
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /type is required/)
      end

      it "raises when condition type is invalid" do
        data = stat_effect.merge("condition" => {"type" => "moonPhase"})
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end

      context "hasStatus" do
        it "accepts a valid hasStatus condition" do
          data = stat_effect.merge("condition" => {"type" => "hasStatus", "statusName" => "Enrage"})
          expect { described_class.validate!(data) }.not_to raise_error
        end

        it "raises when statusName is missing" do
          data = stat_effect.merge("condition" => {"type" => "hasStatus"})
          expect { described_class.validate!(data) }
            .to raise_error(Validators::ValidationError, /statusName is required/)
        end
      end

      context "selfHealthPct / targetHealthPct" do
        it "accepts a valid selfHealthPct condition" do
          data = stat_effect.merge("condition" => {"type" => "selfHealthPct", "comparison" => "below", "threshold" => 30.0})
          expect { described_class.validate!(data) }.not_to raise_error
        end

        it "accepts a valid targetHealthPct condition" do
          data = stat_effect.merge("condition" => {"type" => "targetHealthPct", "comparison" => "above", "threshold" => 50.0})
          expect { described_class.validate!(data) }.not_to raise_error
        end

        it "raises when comparison is invalid" do
          data = stat_effect.merge("condition" => {"type" => "selfHealthPct", "comparison" => "near", "threshold" => 30.0})
          expect { described_class.validate!(data) }
            .to raise_error(Validators::ValidationError, /must be one of/)
        end

        it "raises when threshold is missing" do
          data = stat_effect.merge("condition" => {"type" => "selfHealthPct", "comparison" => "below"})
          expect { described_class.validate!(data) }
            .to raise_error(Validators::ValidationError, /threshold is required/)
        end

        it "raises when threshold is out of range" do
          data = stat_effect.merge("condition" => {"type" => "selfHealthPct", "comparison" => "below", "threshold" => 101})
          expect { described_class.validate!(data) }
            .to raise_error(Validators::ValidationError, /threshold must be between 0 and 100/)
        end
      end

      context "casterResource" do
        it "accepts a valid casterResource condition" do
          data = stat_effect.merge("condition" => {"type" => "casterResource", "resourceName" => "combo points", "comparison" => "above", "threshold" => 3.0})
          expect { described_class.validate!(data) }.not_to raise_error
        end

        it "raises when resourceName is missing" do
          data = stat_effect.merge("condition" => {"type" => "casterResource", "comparison" => "above", "threshold" => 3.0})
          expect { described_class.validate!(data) }
            .to raise_error(Validators::ValidationError, /resourceName is required/)
        end

        it "allows a threshold outside 0-100, unlike the health-pct conditions" do
          data = stat_effect.merge("condition" => {"type" => "casterResource", "resourceName" => "energy", "comparison" => "above", "threshold" => 500.0})
          expect { described_class.validate!(data) }.not_to raise_error
        end
      end

      it "works on a recurring effect too" do
        data = recurring_effect.merge("condition" => {"type" => "selfHealthPct", "comparison" => "below", "threshold" => 30.0})
        expect { described_class.validate!(data) }.not_to raise_error
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
