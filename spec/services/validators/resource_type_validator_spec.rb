require "rails_helper"

RSpec.describe Validators::ResourceTypeValidator, type: :validator do
  let(:valid_resource) { zone_fixture["unitTypes"]["goblin"]["resource"] }

  describe ".validate!" do
    it "accepts the goblin energy resource from the fixture" do
      expect { described_class.validate!(valid_resource) }.not_to raise_error
    end

    it "accepts a resource without returnRate" do
      data = valid_resource.except("returnRate")
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "raises when name is missing" do
      expect { described_class.validate!(valid_resource.except("name")) }
        .to raise_error(Validators::ValidationError, /name is required/)
    end

    it "raises when color is missing" do
      expect { described_class.validate!(valid_resource.except("color")) }
        .to raise_error(Validators::ValidationError, /color is required/)
    end

    it "raises when color has a # prefix" do
      expect { described_class.validate!(valid_resource.merge("color" => "#AADD00")) }
        .to raise_error(Validators::ValidationError, /6-digit hex/)
    end

    it "raises when color is not 6 characters" do
      expect { described_class.validate!(valid_resource.merge("color" => "AAD")) }
        .to raise_error(Validators::ValidationError, /6-digit hex/)
    end

    it "raises when returnRate is negative" do
      expect { described_class.validate!(valid_resource.merge("returnRate" => -1.0)) }
        .to raise_error(Validators::ValidationError, /non-negative/)
    end

    it "raises when isFluid is missing" do
      expect { described_class.validate!(valid_resource.except("isFluid")) }
        .to raise_error(Validators::ValidationError, /isFluid is required/)
    end

    it "raises when isFluid is not a boolean" do
      expect { described_class.validate!(valid_resource.merge("isFluid" => "yes")) }
        .to raise_error(Validators::ValidationError, /must be a boolean/)
    end
  end
end
