require "rails_helper"

RSpec.describe Validators::RespawnConfigValidator, type: :validator do
  describe ".validate!" do
    it "accepts none" do
      expect { described_class.validate!({"type" => "none"}) }.not_to raise_error
    end

    it "accepts a timer" do
      expect { described_class.validate!({"type" => "timer", "delaySeconds" => 120.0}) }.not_to raise_error
    end

    it "accepts a zero delay" do
      expect { described_class.validate!({"type" => "timer", "delaySeconds" => 0}) }.not_to raise_error
    end

    it "raises when type is missing" do
      expect { described_class.validate!({}) }
        .to raise_error(Validators::ValidationError, /type is required/)
    end

    it "raises when type is invalid" do
      expect { described_class.validate!({"type" => "instant"}) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "raises when a timer is missing delaySeconds" do
      expect { described_class.validate!({"type" => "timer"}) }
        .to raise_error(Validators::ValidationError, /delaySeconds is required/)
    end

    it "raises when delaySeconds is negative" do
      expect { described_class.validate!({"type" => "timer", "delaySeconds" => -1}) }
        .to raise_error(Validators::ValidationError, /delaySeconds must be non-negative/)
    end

    it "does not require delaySeconds for none" do
      expect { described_class.validate!({"type" => "none", "delaySeconds" => "ignored"}) }.not_to raise_error
    end
  end
end
