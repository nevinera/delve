require "rails_helper"

RSpec.describe Validators::AuraEffectValidator, type: :validator do
  let(:valid_aura) do
    {"sourceURL" => "https://example.com/fx/shield-aura.webp", "scale" => 1.2, "opacity" => 0.8}
  end

  describe ".validate!" do
    it "accepts a minimal aura with just sourceURL" do
      expect { described_class.validate!({"sourceURL" => "https://example.com/fx/aura.webp"}) }.not_to raise_error
    end

    it "accepts a valid aura with optional cosmetic fields" do
      expect { described_class.validate!(valid_aura) }.not_to raise_error
    end

    it "raises when sourceURL is missing" do
      expect { described_class.validate!(valid_aura.except("sourceURL")) }
        .to raise_error(Validators::ValidationError, /sourceURL is required/)
    end

    it "accepts spriteColumns and spriteRows together" do
      data = valid_aura.merge("spriteColumns" => 5, "spriteRows" => 1)
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "raises when spriteColumns is given without spriteRows" do
      expect { described_class.validate!(valid_aura.merge("spriteColumns" => 5)) }
        .to raise_error(Validators::ValidationError, /spriteColumns and spriteRows must be given together/)
    end

    it "accepts an optional color tint" do
      expect { described_class.validate!(valid_aura.merge("color" => "ff0000")) }.not_to raise_error
    end

    it "accepts a color tint led by a # prefix" do
      expect { described_class.validate!(valid_aura.merge("color" => "#ff0000")) }.not_to raise_error
    end

    it "raises when the color tint is not a valid hex string" do
      expect { described_class.validate!(valid_aura.merge("color" => "red")) }
        .to raise_error(Validators::ValidationError, /color must be a 6-digit hex string/)
    end

    context "stock asset references" do
      it "accepts a recognized stock graphic" do
        expect { described_class.validate!(valid_aura.merge("sourceURL" => ":arc:")) }.not_to raise_error
      end

      it "raises when the stock graphic name isn't recognized" do
        expect { described_class.validate!(valid_aura.merge("sourceURL" => ":not-a-real-graphic:")) }
          .to raise_error(Validators::ValidationError, /not a recognized stock asset/)
      end
    end

    it "has no duration/from/to/when/condition fields to validate - GraphicEffect's cast/impact-only concepts" do
      # AuraEffect is a distinct type from GraphicEffect (see
      # docs/schema/aura_effect.md) - it never recognized these fields, so
      # there's nothing to reject; an extra key here is like any other
      # unrecognized key elsewhere in the schema and is simply ignored.
      data = valid_aura.merge("duration" => 0.5, "from" => "self", "when" => "immediate", "condition" => "always")
      expect { described_class.validate!(data) }.not_to raise_error
    end
  end
end
