require "rails_helper"

RSpec.describe Validators::MapValidator, type: :validator do
  describe ".validate!" do
    it "accepts the cave entrance map from the fixture" do
      expect { described_class.validate!(cave_entrance_map) }.not_to raise_error
    end

    it "accepts the cave interior map from the fixture" do
      expect { described_class.validate!(zone_fixture["maps"][1]) }.not_to raise_error
    end

    it "raises when identifier is missing" do
      expect { described_class.validate!(cave_entrance_map.except("identifier")) }
        .to raise_error(Validators::ValidationError, /identifier is required/)
    end

    it "raises when imageUrl is missing" do
      expect { described_class.validate!(cave_entrance_map.except("imageUrl")) }
        .to raise_error(Validators::ValidationError, /imageUrl is required/)
    end

    it "raises when pixelDimensions is missing" do
      expect { described_class.validate!(cave_entrance_map.except("pixelDimensions")) }
        .to raise_error(Validators::ValidationError, /pixelDimensions is required/)
    end

    it "raises when pixelDimensions width is not an integer" do
      data = cave_entrance_map.merge("pixelDimensions" => {"width" => 2048.5, "height" => 1536})
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /must be an integer/)
    end

    it "raises when feetDimensions width is not positive" do
      data = cave_entrance_map.merge("feetDimensions" => {"width" => 0.0, "height" => 150.0})
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /width must be positive/)
    end

    context "barriers" do
      it "raises when barrier type is invalid" do
        data = cave_entrance_map.merge("barriers" => [{"type" => "polygon", "locations" => []}])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end

      it "raises when wall barrier has fewer than 2 locations" do
        barrier = {"type" => "wall", "locations" => [{"x" => 0.0, "y" => 0.0}]}
        data = cave_entrance_map.merge("barriers" => [barrier])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /at least 2 elements/)
      end

      it "accepts a circle barrier" do
        barrier = {"type" => "circle", "location" => {"x" => 50.0, "y" => 50.0}, "radius" => 10.0}
        data = cave_entrance_map.merge("barriers" => [barrier])
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "raises when circle radius exceeds 30" do
        barrier = {"type" => "circle", "location" => {"x" => 50.0, "y" => 50.0}, "radius" => 31.0}
        data = cave_entrance_map.merge("barriers" => [barrier])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /radius must be between/)
      end
    end

    context "connections" do
      it "accepts a line connection from the fixture" do
        expect { described_class.validate!(cave_entrance_map) }.not_to raise_error
      end

      it "accepts a point connection" do
        conn = {
          "identifier" => "entrance",
          "type" => "point",
          "position" => {"x" => 50.0, "y" => 50.0, "angle" => 0.0},
          "fuzzRadius" => 5.0,
          "fuzzAngle" => 45.0
        }
        data = cave_entrance_map.merge("connections" => [conn])
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "raises when fuzzRadius exceeds 20" do
        conn = {
          "identifier" => "entrance",
          "type" => "point",
          "position" => {"x" => 50.0, "y" => 50.0, "angle" => 0.0},
          "fuzzRadius" => 25.0,
          "fuzzAngle" => 0.0
        }
        data = cave_entrance_map.merge("connections" => [conn])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /fuzzRadius must be between/)
      end
    end

    context "units" do
      it "propagates unit validation errors with path context" do
        bad_unit = cave_entrance_map["units"][0].merge("hostility" => "unknown")
        data = cave_entrance_map.merge("units" => [bad_unit])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError) { |e| expect(e.path).to match(/units\[0\]/) }
      end
    end
  end
end
