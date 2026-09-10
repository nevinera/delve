require "rails_helper"

RSpec.describe Validators::GraphicEffectValidator, type: :validator do
  let(:valid_graphic) do
    {
      "sourceURL" => "https://example.com/fx/slash.webp",
      "duration" => 0.3,
      "from" => "self",
      "when" => "immediate",
      "condition" => "always"
    }
  end

  describe ".validate!" do
    it "accepts a valid graphic effect" do
      expect { described_class.validate!(valid_graphic) }.not_to raise_error
    end

    it "accepts an optional to field" do
      expect { described_class.validate!(valid_graphic.merge("to" => "affected")) }.not_to raise_error
    end

    it "accepts optional scale and opacity" do
      data = valid_graphic.merge("scale" => 1.5, "opacity" => 0.8)
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "accepts an optional color tint" do
      expect { described_class.validate!(valid_graphic.merge("color" => "ff0000")) }.not_to raise_error
    end

    it "accepts a color tint led by a # prefix" do
      expect { described_class.validate!(valid_graphic.merge("color" => "#ff0000")) }.not_to raise_error
    end

    it "raises when the color tint is not a valid hex string" do
      expect { described_class.validate!(valid_graphic.merge("color" => "red")) }
        .to raise_error(Validators::ValidationError, /color must be a 6-digit hex string/)
    end

    it "raises when sourceURL is missing" do
      expect { described_class.validate!(valid_graphic.except("sourceURL")) }
        .to raise_error(Validators::ValidationError, /sourceURL is required/)
    end

    it "raises when from is invalid" do
      expect { described_class.validate!(valid_graphic.merge("from" => "origin")) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "raises when to is invalid" do
      expect { described_class.validate!(valid_graphic.merge("to" => "target")) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "raises when condition is invalid" do
      expect { described_class.validate!(valid_graphic.merge("condition" => "sometimes")) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "accepts spriteColumns and spriteRows together" do
      data = valid_graphic.merge("spriteColumns" => 3, "spriteRows" => 3)
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "accepts optional spriteFrameCount and spriteFrameRate alongside a sprite sheet" do
      data = valid_graphic.merge("spriteColumns" => 3, "spriteRows" => 3, "spriteFrameCount" => 7, "spriteFrameRate" => 12)
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "raises when spriteColumns is given without spriteRows" do
      expect { described_class.validate!(valid_graphic.merge("spriteColumns" => 3)) }
        .to raise_error(Validators::ValidationError, /spriteColumns and spriteRows must be given together/)
    end

    it "raises when spriteRows is given without spriteColumns" do
      expect { described_class.validate!(valid_graphic.merge("spriteRows" => 3)) }
        .to raise_error(Validators::ValidationError, /spriteColumns and spriteRows must be given together/)
    end

    it "raises when spriteColumns is not an integer" do
      data = valid_graphic.merge("spriteColumns" => 3.5, "spriteRows" => 3)
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /spriteColumns must be an integer/)
    end

    context "stock asset references" do
      it "accepts a recognized stock graphic" do
        expect { described_class.validate!(valid_graphic.merge("sourceURL" => ":arc:")) }.not_to raise_error
      end

      it "raises when the stock graphic name isn't recognized" do
        expect { described_class.validate!(valid_graphic.merge("sourceURL" => ":not-a-real-graphic:")) }
          .to raise_error(Validators::ValidationError, /not a recognized stock asset/)
      end
    end
  end
end
