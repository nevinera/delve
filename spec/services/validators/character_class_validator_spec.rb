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

    it "raises when powers exceeds 10 entries" do
      power = character_class_fixture["powers"][0]
      data = character_class_fixture.merge("powers" => Array.new(11, power))
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /may not exceed 10/)
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

    it "raises when primaryStats is missing" do
      expect { described_class.validate!(character_class_fixture.except("primaryStats")) }
        .to raise_error(Validators::ValidationError, /primaryStats must be an array/)
    end

    it "raises when primaryStats is not an array" do
      data = character_class_fixture.merge("primaryStats" => "strength")
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /primaryStats must be an array/)
    end

    it "raises when primaryStats is empty" do
      data = character_class_fixture.merge("primaryStats" => [])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /must contain at least 1 entry/)
    end

    it "raises when primaryStats contains duplicates" do
      data = character_class_fixture.merge("primaryStats" => ["strength", "strength"])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /must not contain duplicates/)
    end

    it "raises when primaryStats contains an unrecognized value" do
      data = character_class_fixture.merge("primaryStats" => ["strength", "wisdom"])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /unrecognized values: wisdom/)
    end

    it "accepts a hybrid class with multiple primary stats" do
      data = character_class_fixture.merge("primaryStats" => ["strength", "intellect"])
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "raises when secondaryStats is missing" do
      expect { described_class.validate!(character_class_fixture.except("secondaryStats")) }
        .to raise_error(Validators::ValidationError, /secondaryStats must be an array/)
    end

    it "raises when secondaryStats is not an array" do
      data = character_class_fixture.merge("secondaryStats" => "stamina")
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /secondaryStats must be an array/)
    end

    it "raises when secondaryStats does not have exactly 5 entries" do
      data = character_class_fixture.merge("secondaryStats" => ["stamina", "crit_rating"])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /exactly 5 entries/)
    end

    it "raises when secondaryStats contains duplicates" do
      data = character_class_fixture.merge("secondaryStats" => ["stamina"] * 5)
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /must not contain duplicates/)
    end

    it "raises when secondaryStats contains an unrecognized value" do
      data = character_class_fixture.merge(
        "secondaryStats" => ["stamina", "crit_rating", "haste_rating", "mastery_rating", "wisdom"]
      )
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /unrecognized values: wisdom/)
    end

    it "raises when wields is missing" do
      expect { described_class.validate!(character_class_fixture.except("wields")) }
        .to raise_error(Validators::ValidationError, /wields must be an array/)
    end

    it "raises when wields is not an array" do
      data = character_class_fixture.merge("wields" => "sword")
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /wields must be an array/)
    end

    it "raises when wields is empty" do
      data = character_class_fixture.merge("wields" => [])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /wields must contain 1-2 entries/)
    end

    it "raises when wields has more than 2 entries" do
      data = character_class_fixture.merge("wields" => %w[sword shield dagger])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /wields must contain 1-2 entries/)
    end

    it "raises when wields contains an unrecognized value" do
      data = character_class_fixture.merge("wields" => ["trident"])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /unrecognized values: trident/)
    end

    it "accepts a single two-handed wield entry" do
      data = character_class_fixture.merge("wields" => ["staff"])
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "accepts a main-hand/off-hand pair, including matching duplicates" do
      data = character_class_fixture.merge("wields" => %w[dagger dagger])
      expect { described_class.validate!(data) }.not_to raise_error
    end
  end
end
