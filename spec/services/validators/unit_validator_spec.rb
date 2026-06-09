require "rails_helper"

RSpec.describe Validators::UnitValidator, type: :validator do
  let(:wander_unit) { cave_entrance_map["units"][0] }
  let(:still_unit) { cave_entrance_map["units"][3] }
  let(:patrol_unit) { cave_entrance_map["units"][7] }

  describe ".validate!" do
    it "accepts a still unit" do
      expect { described_class.validate!(still_unit) }.not_to raise_error
    end

    it "accepts a wander unit" do
      expect { described_class.validate!(wander_unit) }.not_to raise_error
    end

    it "accepts a patrol unit" do
      expect { described_class.validate!(patrol_unit) }.not_to raise_error
    end

    it "raises when identifier is missing" do
      expect { described_class.validate!(still_unit.except("identifier")) }
        .to raise_error(Validators::ValidationError, /identifier is required/)
    end

    it "raises when unitType is missing" do
      expect { described_class.validate!(still_unit.except("unitType")) }
        .to raise_error(Validators::ValidationError, /unitType is required/)
    end

    it "raises when position is missing" do
      expect { described_class.validate!(still_unit.except("position")) }
        .to raise_error(Validators::ValidationError, /position is required/)
    end

    it "raises when hostility is invalid" do
      expect { described_class.validate!(still_unit.merge("hostility" => "unknown")) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "raises when currentHpFraction is out of range" do
      expect { described_class.validate!(still_unit.merge("currentHpFraction" => 1.5)) }
        .to raise_error(Validators::ValidationError, /between 0.0 and 1.0/)
    end

    it "raises when position angle is out of range" do
      data = still_unit.merge("position" => still_unit["position"].merge("angle" => 400.0))
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /angle must be between 0 and 360/)
    end

    context "wander movement" do
      it "raises when location is missing" do
        data = wander_unit.merge("movement" => wander_unit["movement"].except("location"))
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /location is required/)
      end

      it "raises when speed is not a number or range" do
        data = wander_unit.merge("movement" => wander_unit["movement"].merge("speed" => "fast"))
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be a number or \[min, max\] range/)
      end
    end

    context "patrol movement" do
      it "raises when steps has fewer than 2 entries" do
        movement = patrol_unit["movement"].merge("steps" => [patrol_unit["movement"]["steps"][0]])
        expect { described_class.validate!(patrol_unit.merge("movement" => movement)) }
          .to raise_error(Validators::ValidationError, /at least 2 elements/)
      end

      it "raises when choose is invalid" do
        movement = patrol_unit["movement"].merge("choose" => "zigzag")
        expect { described_class.validate!(patrol_unit.merge("movement" => movement)) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end

      it "raises when movementRate is out of range" do
        steps = patrol_unit["movement"]["steps"].map { |s| s.merge("movementRate" => 1.5) }
        movement = patrol_unit["movement"].merge("steps" => steps)
        expect { described_class.validate!(patrol_unit.merge("movement" => movement)) }
          .to raise_error(Validators::ValidationError, /movementRate must be between/)
      end
    end
  end
end
