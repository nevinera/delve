require "rails_helper"

RSpec.describe Validators::ZoneValidator, type: :validator do
  describe ".validate!" do
    it "accepts the full goblin cave fixture" do
      expect { described_class.validate!(zone_fixture) }.not_to raise_error
    end

    it "raises when name is missing" do
      expect { described_class.validate!(zone_fixture.except("name")) }
        .to raise_error(Validators::ValidationError, /name is required/)
    end

    it "raises when private is missing" do
      expect { described_class.validate!(zone_fixture.except("private")) }
        .to raise_error(Validators::ValidationError, /private is required/)
    end

    it "raises when private is not a boolean" do
      expect { described_class.validate!(zone_fixture.merge("private" => "yes")) }
        .to raise_error(Validators::ValidationError, /must be a boolean/)
    end

    it "raises when maps is missing" do
      expect { described_class.validate!(zone_fixture.except("maps")) }
        .to raise_error(Validators::ValidationError, /maps is required/)
    end

    it "raises when maps is empty" do
      expect { described_class.validate!(zone_fixture.merge("maps" => [])) }
        .to raise_error(Validators::ValidationError, /at least 1 elements/)
    end

    it "raises when a unitType is an AssetReference" do
      data = zone_fixture.merge("unitTypes" => {
        "goblin" => {"$ref" => "unit_types/goblin.json", "referenceTo" => "unit_type"}
      })
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /full JSON required/)
    end

    it "raises when a map is an AssetReference" do
      data = zone_fixture.merge("maps" => [{"$ref" => "maps/cave.json", "referenceTo" => "map"}])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError, /full JSON required/)
    end

    it "raises when unitTypes is not an object" do
      expect { described_class.validate!(zone_fixture.merge("unitTypes" => ["goblin"])) }
        .to raise_error(Validators::ValidationError, /unitTypes must be an object/)
    end

    context "zoneLinks" do
      let(:bad_zone_link) { zone_fixture["zoneLinks"][0].except("requiredKey") }

      it "raises when requiredKey is missing from a zone link" do
        data = zone_fixture.merge("zoneLinks" => [bad_zone_link])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /requiredKey is required/)
      end

      it "raises when connectionA is missing map" do
        link = zone_fixture["zoneLinks"][0].merge("connectionA" => {"connection" => "cave_mouth"})
        data = zone_fixture.merge("zoneLinks" => [link])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /map is required/)
      end

      it "raises when oneWay is not a boolean" do
        link = zone_fixture["zoneLinks"][0].merge("oneWay" => "no")
        data = zone_fixture.merge("zoneLinks" => [link])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be a boolean/)
      end
    end

    context "entryPoints" do
      it "raises when entryPoints is not an object" do
        data = zone_fixture.merge("entryPoints" => ["cave_entrance/clearing_entrance"])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /entryPoints must be an object/)
      end

      it "raises when an entryPoint value is not a string or null" do
        data = zone_fixture.merge("entryPoints" => {"cave_entrance/clearing_entrance" => 42})
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be a string or null/)
      end
    end

    context "unit identifier uniqueness across maps" do
      def zone_with_maps(maps)
        zone_fixture.merge("maps" => maps)
      end

      def minimal_map(identifier, unit_identifiers)
        {
          "identifier"      => identifier,
          "name"            => identifier.capitalize,
          "imageUrl"        => "./bg.webp",
          "pixelDimensions" => {"width" => 1024, "height" => 768},
          "feetDimensions"  => {"width" => 100.0, "height" => 75.0},
          "units"           => unit_identifiers.map { |id|
            {
              "identifier" => id,
              "unitType"   => "goblin",
              "hostility"  => "hostile",
              "position"   => {"x" => 10.0, "y" => 10.0, "angle" => 0.0}
            }
          }
        }
      end

      it "accepts zones where every identifier is unique across maps" do
        maps = [
          minimal_map("map_a", ["goblin_1", "goblin_2"]),
          minimal_map("map_b", ["goblin_3", "goblin_4"])
        ]
        expect { described_class.validate!(zone_with_maps(maps)) }.not_to raise_error
      end

      it "raises when the same identifier appears in two different maps" do
        maps = [
          minimal_map("map_a", ["goblin_1", "goblin_2"]),
          minimal_map("map_b", ["goblin_2", "goblin_3"])
        ]
        expect { described_class.validate!(zone_with_maps(maps)) }
          .to raise_error(Validators::ValidationError, /goblin_2.*already used/)
      end

      it "raises when the same identifier appears twice within one map" do
        maps = [minimal_map("map_a", ["goblin_1", "goblin_1"])]
        expect { described_class.validate!(zone_with_maps(maps)) }
          .to raise_error(Validators::ValidationError, /goblin_1.*already used/)
      end
    end

    it "propagates unit type validation errors with path context" do
      bad_goblin = goblin_unit_type.merge("maxHP" => "lots")
      data = zone_fixture.merge("unitTypes" => {"goblin" => bad_goblin})
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError) { |e| expect(e.path).to include("unitTypes.goblin") }
    end

    it "propagates map validation errors with path context" do
      bad_map = cave_entrance_map.merge("name" => 42)
      data = zone_fixture.merge("maps" => [bad_map])
      expect { described_class.validate!(data) }
        .to raise_error(Validators::ValidationError) { |e| expect(e.path).to match(/maps\[0\]/) }
    end
  end
end
