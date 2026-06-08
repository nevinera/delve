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
  end
end
