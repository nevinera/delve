require "rails_helper"

RSpec.describe Validators::TriggeredEffectValidator, type: :validator do
  let(:harm_effect) { {"type" => "harm", "affects" => "target", "amount" => [2.0, 3.0]} }
  let(:heal_effect) { {"type" => "heal", "affects" => "self", "amount" => 15.0} }
  let(:resource_effect) { {"type" => "resource", "affects" => "self", "resourceName" => "energy", "delta" => 10.0} }
  let(:status_effect) do
    {
      "type" => "status", "affects" => "target", "duration" => 5.0,
      "status" => {"name" => "Weakened", "shortName" => "Weak", "treatAs" => "debuff", "stacking" => "replace", "effects" => []}
    }
  end

  describe ".validate!" do
    it "accepts a harm effect" do
      expect { described_class.validate!(harm_effect) }.not_to raise_error
    end

    it "accepts a heal effect" do
      expect { described_class.validate!(heal_effect) }.not_to raise_error
    end

    it "accepts a resource effect" do
      expect { described_class.validate!(resource_effect) }.not_to raise_error
    end

    it "accepts a status effect" do
      expect { described_class.validate!(status_effect) }.not_to raise_error
    end

    it "raises when type is missing" do
      expect { described_class.validate!({}) }
        .to raise_error(Validators::ValidationError, /type is required/)
    end

    it "raises when type is invalid" do
      expect { described_class.validate!(harm_effect.merge("type" => "shield")) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "raises when affects is missing" do
      data = harm_effect.except("affects")
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /affects is required/)
    end

    it "rejects PowerEffect's bTarget - only self/target are valid here" do
      data = harm_effect.merge("affects" => "bTarget")
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "does not require or use a range field, unlike PowerEffect" do
      expect { described_class.validate!(harm_effect.except("range")) }.not_to raise_error
    end

    context "harm" do
      it "raises when amount is missing" do
        expect { described_class.validate!(harm_effect.except("amount")) }
          .to raise_error(Validators::ValidationError, /amount is required/)
      end

      it "accepts an optional school" do
        expect { described_class.validate!(harm_effect.merge("school" => "magic")) }.not_to raise_error
      end

      it "raises when school is invalid" do
        expect { described_class.validate!(harm_effect.merge("school" => "fire")) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end
    end

    context "heal" do
      it "raises when amount is missing" do
        expect { described_class.validate!(heal_effect.except("amount")) }
          .to raise_error(Validators::ValidationError, /amount is required/)
      end
    end

    context "resource" do
      it "raises when resourceName is missing" do
        expect { described_class.validate!(resource_effect.except("resourceName")) }
          .to raise_error(Validators::ValidationError, /resourceName is required/)
      end

      it "raises when delta is missing" do
        expect { described_class.validate!(resource_effect.except("delta")) }
          .to raise_error(Validators::ValidationError, /delta is required/)
      end
    end

    context "status" do
      it "raises when duration is missing" do
        expect { described_class.validate!(status_effect.except("duration")) }
          .to raise_error(Validators::ValidationError, /duration is required/)
      end

      it "propagates the nested status's own validation errors" do
        data = status_effect.merge("status" => status_effect["status"].except("shortName"))
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /shortName is required/)
      end
    end

    context "when data is an AssetReference" do
      it "raises with full JSON required message" do
        expect { described_class.validate!({"$ref" => "effects/foo.json", "referenceTo" => "triggered_effect"}) }
          .to raise_error(Validators::ValidationError, /full JSON required/)
      end
    end
  end
end
