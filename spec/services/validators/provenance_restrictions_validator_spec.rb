require "rails_helper"

RSpec.describe Validators::ProvenanceRestrictionsValidator, type: :validator do
  describe ".validate!" do
    it "accepts an empty object" do
      expect { described_class.validate!({}) }.not_to raise_error
    end

    it "accepts worlds and maxElevation" do
      expect { described_class.validate!({"worlds" => ["barrens"], "maxElevation" => 400}) }.not_to raise_error
    end

    it "accepts an empty worlds list" do
      expect { described_class.validate!({"worlds" => []}) }.not_to raise_error
    end

    it "accepts a zero maxElevation" do
      expect { described_class.validate!({"maxElevation" => 0}) }.not_to raise_error
    end

    it "raises when worlds is not an array" do
      expect { described_class.validate!({"worlds" => "barrens"}) }
        .to raise_error(Validators::ValidationError, /worlds must be an array/)
    end

    it "raises when a world is not a non-empty string" do
      expect { described_class.validate!({"worlds" => ["barrens", ""]}) }
        .to raise_error(Validators::ValidationError) { |e| expect(e.path).to match(/worlds/) }
    end

    it "raises when maxElevation is not an integer" do
      expect { described_class.validate!({"maxElevation" => 1.5}) }
        .to raise_error(Validators::ValidationError, /maxElevation must be an integer/)
    end

    it "raises when maxElevation is negative" do
      expect { described_class.validate!({"maxElevation" => -1}) }
        .to raise_error(Validators::ValidationError, /maxElevation must be at least 0/)
    end
  end
end
