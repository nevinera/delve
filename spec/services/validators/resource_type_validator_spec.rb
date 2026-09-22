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

    it "accepts returnRate explicitly null - the editor clears a field this way, not by deleting its key" do
      expect { described_class.validate!(valid_resource.merge("returnRate" => nil)) }.not_to raise_error
    end

    it "raises when name is missing" do
      expect { described_class.validate!(valid_resource.except("name")) }
        .to raise_error(Validators::ValidationError, /name is required/)
    end

    it "raises when color is missing" do
      expect { described_class.validate!(valid_resource.except("color")) }
        .to raise_error(Validators::ValidationError, /color is required/)
    end

    it "accepts a color led by a # prefix" do
      expect { described_class.validate!(valid_resource.merge("color" => "#AADD00")) }.not_to raise_error
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

    it "accepts a resource without displayType" do
      expect { described_class.validate!(valid_resource.except("displayType")) }.not_to raise_error
    end

    it "accepts displayType: primary" do
      expect { described_class.validate!(valid_resource.merge("displayType" => "primary")) }.not_to raise_error
    end

    it "raises when displayType is not a recognized value" do
      expect { described_class.validate!(valid_resource.merge("displayType" => "secondary")) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    it "accepts a resource without hasteAffected" do
      expect { described_class.validate!(valid_resource.except("hasteAffected")) }.not_to raise_error
    end

    it "accepts hasteAffected: true" do
      expect { described_class.validate!(valid_resource.merge("hasteAffected" => true)) }.not_to raise_error
    end

    it "raises when hasteAffected is not a boolean" do
      expect { described_class.validate!(valid_resource.merge("hasteAffected" => "yes")) }
        .to raise_error(Validators::ValidationError, /must be a boolean/)
    end
  end
end
