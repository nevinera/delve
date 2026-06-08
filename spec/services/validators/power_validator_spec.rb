require "rails_helper"

RSpec.describe Validators::PowerValidator, type: :validator do
  let(:stab_power) { zone_fixture["unitTypes"]["goblin"]["powers"][0] }
  let(:enrage_power) { zone_fixture["unitTypes"]["goblin"]["powers"][1] }

  describe ".validate!" do
    it "accepts the Stab power from the fixture" do
      expect { described_class.validate!(stab_power) }.not_to raise_error
    end

    it "accepts the Enrage power with cooldown" do
      expect { described_class.validate!(enrage_power) }.not_to raise_error
    end

    it "accepts castTime: null" do
      expect { described_class.validate!(stab_power) }.not_to raise_error
    end

    it "raises when name is missing" do
      expect { described_class.validate!(stab_power.except("name")) }
        .to raise_error(Validators::ValidationError, /name is required/)
    end

    it "raises when castTime is a non-null, non-numeric value" do
      expect { described_class.validate!(stab_power.merge("castTime" => "instant")) }
        .to raise_error(Validators::ValidationError, /castTime must be a number or null/)
    end

    it "raises when globalCooldown is missing" do
      expect { described_class.validate!(stab_power.except("globalCooldown")) }
        .to raise_error(Validators::ValidationError, /globalCooldown is required/)
    end

    it "raises when effects is missing" do
      expect { described_class.validate!(stab_power.except("effects")) }
        .to raise_error(Validators::ValidationError, /effects is required/)
    end

    it "validates nested graphicEffects" do
      data = stab_power.merge("graphicEffects" => [{"from" => "self"}])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /sourceURL is required/)
    end

    it "validates nested soundEffects" do
      data = stab_power.merge("soundEffects" => [{"location" => "self"}])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /sourceURL is required/)
    end

    it "propagates errors from nested effects with path context" do
      data = stab_power.merge("effects" => [{"type" => "harm"}])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError) { |e| expect(e.path).to match(/effects\[0\]/) }
    end
  end
end
