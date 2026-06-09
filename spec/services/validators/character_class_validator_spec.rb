require "rails_helper"

RSpec.describe Validators::CharacterClassValidator, type: :validator do
  describe ".validate!" do
    it "accepts the full puncher fixture" do
      expect { described_class.validate!(character_class_fixture) }.not_to raise_error
    end

    it "raises when name is missing" do
      expect { described_class.validate!(character_class_fixture.except("name")) }
        .to raise_error(Validators::ValidationError, /name is required/)
    end

    it "raises when description is not a string" do
      expect { described_class.validate!(character_class_fixture.merge("description" => 42)) }
        .to raise_error(Validators::ValidationError, /description must be a string/)
    end

    it "raises when colors is missing" do
      expect { described_class.validate!(character_class_fixture.except("colors")) }
        .to raise_error(Validators::ValidationError, /colors is required/)
    end

    it "raises when major color is missing" do
      data = character_class_fixture.merge("colors" => {"minor" => "F4A460"})
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /major is required/)
    end

    it "raises when minor color is missing" do
      data = character_class_fixture.merge("colors" => {"major" => "8B4513"})
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /minor is required/)
    end

    it "raises when major color is not a valid hex string" do
      data = character_class_fixture.merge("colors" => {"major" => "#8B4513", "minor" => "F4A460"})
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /major must be a 6-digit hex string/)
    end

    it "raises when minor color is not a valid hex string" do
      data = character_class_fixture.merge("colors" => {"major" => "8B4513", "minor" => "gg0000"})
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /minor must be a 6-digit hex string/)
    end

    it "raises when resources is not an array" do
      expect { described_class.validate!(character_class_fixture.merge("resources" => {})) }
        .to raise_error(Validators::ValidationError, /resources must be an array/)
    end

    it "propagates resource validation errors with path context" do
      bad_resource = {"name" => "Rage", "color" => "CC0000", "max" => 100.0, "defaultValue" => 0.0, "isFluid" => true, "returnRate" => -1}
      data = character_class_fixture.merge("resources" => [bad_resource])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError) { |e| expect(e.path).to match(/resources\[0\]/) }
    end

    it "raises when powers is not an array" do
      expect { described_class.validate!(character_class_fixture.merge("powers" => {})) }
        .to raise_error(Validators::ValidationError, /powers must be an array/)
    end

    it "raises when powers exceeds 12 entries" do
      power = character_class_fixture["powers"][0]
      data = character_class_fixture.merge("powers" => Array.new(13, power))
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /may not exceed 12/)
    end

    it "propagates power validation errors with path context" do
      bad_power = character_class_fixture["powers"][0].except("castTime")
      data = character_class_fixture.merge("powers" => [bad_power])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError) { |e| expect(e.path).to match(/powers\[0\]/) }
    end

    it "raises when a power is an AssetReference" do
      data = character_class_fixture.merge("powers" => [{"$ref" => "powers/punch.json", "referenceTo" => "power"}])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /full JSON required/)
    end

    it "accepts a class with no powers" do
      expect { described_class.validate!(character_class_fixture.except("powers")) }.not_to raise_error
    end

    it "accepts a class with no resources" do
      expect { described_class.validate!(character_class_fixture.except("resources")) }.not_to raise_error
    end

    it "accepts a class with no description" do
      expect { described_class.validate!(character_class_fixture.except("description")) }.not_to raise_error
    end
  end
end
