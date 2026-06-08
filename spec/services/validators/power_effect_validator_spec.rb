require "rails_helper"

RSpec.describe Validators::PowerEffectValidator, type: :validator do
  let(:harm_effect) do
    {"type" => "harm", "affects" => "bTarget", "amount" => [2.0, 3.0], "range" => 5.0, "tags" => ["physical"]}
  end

  let(:heal_effect) do
    {"type" => "heal", "affects" => "gTarget", "amount" => 10.0, "range" => 20.0}
  end

  let(:self_heal_effect) do
    {"type" => "heal", "affects" => "self", "amount" => 5.0}
  end

  let(:resource_effect) do
    {"type" => "resource", "affects" => "self", "resourceName" => "energy", "delta" => -20.0}
  end

  let(:status_effect) do
    zone_fixture["unitTypes"]["goblin"]["powers"][1]["effects"][0]
  end

  describe ".validate!" do
    it "accepts a harm effect from the fixture" do
      expect { described_class.validate!(zone_fixture["unitTypes"]["goblin"]["powers"][0]["effects"][0]) }.not_to raise_error
    end

    it "accepts a status effect from the fixture" do
      expect { described_class.validate!(status_effect) }.not_to raise_error
    end

    it "accepts a heal effect" do
      expect { described_class.validate!(heal_effect) }.not_to raise_error
    end

    it "accepts a self-heal without range" do
      expect { described_class.validate!(self_heal_effect) }.not_to raise_error
    end

    it "accepts a resource effect targeting self" do
      expect { described_class.validate!(resource_effect) }.not_to raise_error
    end

    it "raises when type is missing" do
      expect { described_class.validate!({}) }
        .to raise_error(Validators::ValidationError, /type is required/)
    end

    it "raises when type is invalid" do
      expect { described_class.validate!({"type" => "shield"}) }
        .to raise_error(Validators::ValidationError, /must be one of/)
    end

    context "harm effects" do
      it "raises when affects is self" do
        data = harm_effect.merge("affects" => "self")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end

      it "raises when range is missing" do
        data = harm_effect.except("range")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /range is required/)
      end

      it "accepts a floatRange for amount" do
        expect { described_class.validate!(harm_effect) }.not_to raise_error
      end
    end

    context "tags" do
      it "raises when a tag exceeds 16 characters" do
        data = harm_effect.merge("tags" => ["a" * 17])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /16 characters or fewer/)
      end

      it "raises when there are more than 24 tags" do
        data = harm_effect.merge("tags" => Array.new(25, "tag"))
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /may not exceed 24/)
      end
    end

    context "status effects" do
      it "raises when duration is missing" do
        data = status_effect.except("duration")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /duration is required/)
      end

      it "raises when status is missing" do
        data = status_effect.except("status")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /status is required/)
      end

      it "propagates validation errors from nested Status" do
        data = status_effect.merge("status" => {"name" => "Bad"})
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError) { |e| expect(e.path).to include("status") }
      end
    end
  end
end
