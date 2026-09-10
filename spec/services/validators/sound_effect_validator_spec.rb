require "rails_helper"

RSpec.describe Validators::SoundEffectValidator, type: :validator do
  let(:valid_sound) do
    {
      "sourceURL" => "https://example.com/sounds/stab.ogg",
      "duration" => 0.5,
      "location" => "self",
      "when" => "immediate",
      "condition" => "always"
    }
  end

  describe ".validate!" do
    it "accepts a valid sound effect" do
      expect { described_class.validate!(valid_sound) }.not_to raise_error
    end

    it "accepts optional name field" do
      expect { described_class.validate!(valid_sound.merge("name" => "Stab Sound")) }.not_to raise_error
    end

    it "accepts optional volumeScale and pitchScale" do
      data = valid_sound.merge("volumeScale" => 0.8, "pitchScale" => 1.2)
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "raises when sourceURL is missing" do
      expect { described_class.validate!(valid_sound.except("sourceURL")) }
        .to raise_error(Validators::ValidationError, /sourceURL is required/)
    end

    it "raises when duration is missing" do
      expect { described_class.validate!(valid_sound.except("duration")) }
        .to raise_error(Validators::ValidationError, /duration is required/)
    end

    it "raises when location is invalid" do
      expect { described_class.validate!(valid_sound.merge("location" => "nearby")) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "raises when when is invalid" do
      expect { described_class.validate!(valid_sound.merge("when" => "later")) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "raises when condition is invalid" do
      expect { described_class.validate!(valid_sound.merge("condition" => "sometimes")) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "accepts a valid impactTiming" do
      data = valid_sound.merge("when" => "impact", "impactTiming" => "centered")
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "raises when impactTiming is invalid" do
      data = valid_sound.merge("when" => "impact", "impactTiming" => "eventually")
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "accepts impactTiming explicitly null - the editor clears a field this way, not by deleting its key" do
      expect { described_class.validate!(valid_sound.merge("impactTiming" => nil)) }.not_to raise_error
    end

    context "stock asset references" do
      it "accepts a recognized stock sound" do
        expect { described_class.validate!(valid_sound.merge("sourceURL" => ":twang:")) }.not_to raise_error
      end

      it "raises when the stock sound name isn't recognized" do
        expect { described_class.validate!(valid_sound.merge("sourceURL" => ":not-a-real-sound:")) }
          .to raise_error(Validators::ValidationError, /not a recognized stock asset/)
      end
    end
  end
end
