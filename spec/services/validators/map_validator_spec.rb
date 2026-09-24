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

    context "elvl" do
      it "accepts a map without elvl (defaults to the zone's)" do
        expect { described_class.validate!(cave_entrance_map.except("elvl")) }.not_to raise_error
      end

      it "accepts a map with a valid elvl" do
        data = cave_entrance_map.merge("elvl" => 8)
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "raises when elvl is not an integer" do
        data = cave_entrance_map.merge("elvl" => 8.5)
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be an integer/)
      end

      it "raises when elvl is negative" do
        data = cave_entrance_map.merge("elvl" => -1)
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /elvl must be at least 0/)
      end

      it "accepts elvl explicitly null, same as omitted" do
        expect { described_class.validate!(cave_entrance_map.merge("elvl" => nil)) }.not_to raise_error
      end
    end

    context "lighting" do
      it "accepts a map without lighting (defaults to daylight client-side)" do
        expect { described_class.validate!(cave_entrance_map.except("lighting")) }.not_to raise_error
      end

      it "accepts 'daylight'" do
        data = cave_entrance_map.merge("lighting" => "daylight")
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "accepts 'torchlight'" do
        data = cave_entrance_map.merge("lighting" => "torchlight")
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "raises for an invalid value" do
        data = cave_entrance_map.merge("lighting" => "moonlight")
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end
    end

    context "thumbnailUrl" do
      it "accepts a map without thumbnailUrl (older maps, or generation failed)" do
        expect { described_class.validate!(cave_entrance_map.except("thumbnailUrl")) }.not_to raise_error
      end

      it "accepts a map with a thumbnailUrl" do
        data = cave_entrance_map.merge("thumbnailUrl" => "gc1-goblin-cave-entrance.thumb.webp")
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "raises when thumbnailUrl is not a string" do
        data = cave_entrance_map.merge("thumbnailUrl" => 123)
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be a string/)
      end

      it "accepts thumbnailUrl explicitly null, same as omitted" do
        expect { described_class.validate!(cave_entrance_map.merge("thumbnailUrl" => nil)) }.not_to raise_error
      end
    end

    it "accepts barriers/connections/units explicitly null, same as omitted" do
      data = cave_entrance_map.merge("barriers" => nil, "connections" => nil, "units" => nil)
      expect { described_class.validate!(data) }.not_to raise_error
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

      def wall_with_locations(count)
        {"type" => "wall", "locations" => Array.new(count) { |i| {"x" => i.to_f, "y" => 0.0} }}
      end

      it "accepts walls totaling exactly 3000 segments" do
        data = cave_entrance_map.merge("barriers" => [wall_with_locations(3001)])
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "raises when walls total more than 3000 segments" do
        data = cave_entrance_map.merge("barriers" => [wall_with_locations(3002)])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /3001 segments, more than the maximum of 3000/)
      end

      it "accepts 500 circles (3000 segments)" do
        circle = {"type" => "circle", "location" => {"x" => 50.0, "y" => 50.0}, "radius" => 10.0}
        data = cave_entrance_map.merge("barriers" => Array.new(500) { circle })
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "raises when 501 circles exceed 3000 segments" do
        circle = {"type" => "circle", "location" => {"x" => 50.0, "y" => 50.0}, "radius" => 10.0}
        data = cave_entrance_map.merge("barriers" => Array.new(501) { circle })
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /3006 segments, more than the maximum of 3000/)
      end

      it "sums segments across mixed wall and circle barriers" do
        data = cave_entrance_map.merge("barriers" => [wall_with_locations(2996), {"type" => "circle", "location" => {"x" => 50.0, "y" => 50.0}, "radius" => 10.0}])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /3001 segments, more than the maximum of 3000/)
      end
    end

    context "ncus" do
      let(:ncu) do
        {"identifier" => "grizzle", "name" => "Grizzle", "tokenImageUrl" => "./g.webp", "tokenRadius" => 2.0,
         "position" => {"x" => 1.0, "y" => 1.0, "angle" => 0.0}}
      end

      it "accepts a list of NCUs" do
        expect { described_class.validate!(cave_entrance_map.merge("ncus" => [ncu])) }.not_to raise_error
      end

      it "raises when ncus isn't an array" do
        expect { described_class.validate!(cave_entrance_map.merge("ncus" => ncu)) }
          .to raise_error(Validators::ValidationError, /ncus must be an array/)
      end

      it "propagates NCU errors with path context" do
        expect { described_class.validate!(cave_entrance_map.merge("ncus" => [ncu.except("name")])) }
          .to raise_error(Validators::ValidationError) { |e| expect(e.path).to match(/ncus\[0\]/) }
      end
    end

    context "respawn" do
      it "accepts a map with no respawn" do
        expect { described_class.validate!(cave_entrance_map.except("respawn")) }.not_to raise_error
      end

      it "accepts a valid respawn" do
        data = cave_entrance_map.merge("respawn" => {"type" => "timer", "delaySeconds" => 120})
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "propagates respawn validation errors with path context" do
        data = cave_entrance_map.merge("respawn" => {"type" => "timer"})
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError) { |e| expect(e.path).to match(/respawn/) }
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
