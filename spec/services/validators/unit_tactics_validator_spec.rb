require "rails_helper"

RSpec.describe Validators::UnitTacticsValidator do
  let(:rotation) { {"type" => "rotation", "powers" => ["slash"]} }

  def phased(transition)
    {"type" => "phased", "phases" => [{"tactics" => rotation, "transition" => transition}, {"tactics" => rotation}]}
  end

  def validate!(data) = described_class.validate!(data, known_power_names: ["slash"])

  describe "phase transitions" do
    it "accepts timeElapsed or healthBelow" do
      expect { validate!(phased("timeElapsed" => 30)) }.not_to raise_error
      expect { validate!(phased("healthBelow" => 0.5)) }.not_to raise_error
    end

    it "requires one of them" do
      expect { validate!(phased({})) }.to raise_error(Validators::ValidationError, /timeElapsed or healthBelow/)
    end

    it "rejects a non-numeric timeElapsed" do
      expect { validate!(phased("timeElapsed" => "soon")) }
        .to raise_error(Validators::ValidationError, /timeElapsed must be a number/)
    end

    it "rejects a healthBelow outside 0.0-1.0" do
      expect { validate!(phased("healthBelow" => 1.5)) }
        .to raise_error(Validators::ValidationError, /healthBelow must be a number between 0.0 and 1.0/)
      expect { validate!(phased("healthBelow" => "half")) }
        .to raise_error(Validators::ValidationError, /healthBelow/)
    end

    it "doesn't need a transition on the last phase" do
      expect { validate!(phased("timeElapsed" => 30)) }.not_to raise_error
    end
  end
end
