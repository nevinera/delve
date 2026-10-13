require "rails_helper"

RSpec.describe Validators::WorldValidator, type: :validator do
  it_behaves_like "annotatable" do
    let(:annotatable) { world_fixture }
  end

  describe ".validate!" do
    it "accepts the full northern barrens fixture" do
      expect { described_class.validate!(world_fixture) }.not_to raise_error
    end

    it "raises when name is missing" do
      expect { described_class.validate!(world_fixture.except("name")) }
        .to raise_error(Validators::ValidationError, /name is required/)
    end

    it "allows thumbnailUrl, elevationRange, and worldLinks explicitly null, same as omitted" do
      data = world_fixture.merge("thumbnailUrl" => nil, "elevationRange" => nil, "worldLinks" => nil)
      expect { described_class.validate!(data) }.not_to raise_error
    end

    it "raises when thumbnailUrl is not a string" do
      expect { described_class.validate!(world_fixture.merge("thumbnailUrl" => 42)) }
        .to raise_error(Validators::ValidationError, /thumbnailUrl must be a string/)
    end

    it "accepts a questsPath" do
      expect { described_class.validate!(world_fixture.merge("questsPath" => "./demo.quests.json")) }.not_to raise_error
    end

    it "raises when questsPath is not a string" do
      expect { described_class.validate!(world_fixture.merge("questsPath" => 42)) }
        .to raise_error(Validators::ValidationError, /questsPath must be a string/)
    end

    context "elevationRange" do
      it "raises when it is not a two-element array" do
        expect { described_class.validate!(world_fixture.merge("elevationRange" => [0])) }
          .to raise_error(Validators::ValidationError, /elevationRange must be a \[min, max\] array/)
      end

      it "raises when its elements are not integers" do
        expect { described_class.validate!(world_fixture.merge("elevationRange" => [0.0, 800])) }
          .to raise_error(Validators::ValidationError, /elevationRange must be a \[min, max\] array/)
      end

      it "raises when min is negative" do
        expect { described_class.validate!(world_fixture.merge("elevationRange" => [-1, 800])) }
          .to raise_error(Validators::ValidationError, /elevationRange values must be at least 0/)
      end

      it "raises when min exceeds max" do
        expect { described_class.validate!(world_fixture.merge("elevationRange" => [800, 0])) }
          .to raise_error(Validators::ValidationError, /elevationRange min must not exceed max/)
      end
    end

    context "atlas" do
      def loc(x, y) = {"x" => x, "y" => y}
      let(:square) { [loc(0, 0), loc(100, 0), loc(100, 100), loc(0, 100)] }
      def with_zone(zone) = world_fixture.merge("atlas" => {"zones" => {"goblin_cave" => zone}})

      it "accepts outlines and map locations" do
        data = with_zone("outline" => square, "maps" => {"entrance" => loc(10, 10)})
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "allows it explicitly null" do
        expect { described_class.validate!(world_fixture.merge("atlas" => nil)) }.not_to raise_error
      end

      it "needs zones" do
        expect { described_class.validate!(world_fixture.merge("atlas" => {})) }
          .to raise_error(Validators::ValidationError, /zones is required/)
      end

      it "takes outlines of 3 or more points" do
        expect { described_class.validate!(with_zone("outline" => square.first(3), "maps" => {})) }.not_to raise_error
        ell = [loc(0, 0), loc(100, 0), loc(100, 50), loc(50, 50), loc(50, 100), loc(0, 100)]
        expect { described_class.validate!(with_zone("outline" => ell, "maps" => {})) }.not_to raise_error
      end

      it "needs 3 to 64 outline points" do
        expect { described_class.validate!(with_zone("outline" => square.first(2), "maps" => {})) }
          .to raise_error(Validators::ValidationError, /outline must have 3 to 64 points/)
      end

      it "takes bends keyed by a link's two ends" do
        bends = {"darkwood/camp/north|darkwood/road/south" => loc(10, -20)}
        data = world_fixture.merge("atlas" => {"zones" => {}, "bends" => bends})
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "refuses a bend with a malformed key or offset" do
        expect { described_class.validate!(world_fixture.merge("atlas" => {"zones" => {}, "bends" => {"camp|road" => loc(1, 1)}})) }
          .to raise_error(Validators::ValidationError, /bend key must be two zone\/map\/connection ends/)
        expect { described_class.validate!(world_fixture.merge("atlas" => {"zones" => {}, "bends" => {"a/b/c|d/e/f" => {"x" => 1}}})) }
          .to raise_error(Validators::ValidationError, /y is required/)
      end

      it "refuses an outline that crosses itself" do
        bowtie = [loc(0, 0), loc(100, 100), loc(100, 0), loc(0, 100)]
        expect { described_class.validate!(with_zone("outline" => bowtie, "maps" => {})) }
          .to raise_error(Validators::ValidationError, /outline must not cross itself or be flat/)
      end

      it "refuses a map location missing a coordinate" do
        expect { described_class.validate!(with_zone("outline" => square, "maps" => {"entrance" => {"x" => 1}})) }
          .to raise_error(Validators::ValidationError) { |e| expect(e.path).to eq("$.atlas.zones.goblin_cave.maps.entrance.y") }
      end
    end

    context "provenanceRestrictions" do
      it "accepts valid restrictions" do
        data = world_fixture.merge("provenanceRestrictions" => {"worlds" => ["other"], "maxElevation" => 400})
        expect { described_class.validate!(data) }.not_to raise_error
      end

      it "allows it explicitly null" do
        expect { described_class.validate!(world_fixture.merge("provenanceRestrictions" => nil)) }.not_to raise_error
      end

      it "propagates errors with path context" do
        data = world_fixture.merge("provenanceRestrictions" => {"maxElevation" => -5})
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError) { |e| expect(e.path).to match(/provenanceRestrictions/) }
      end
    end

    context "zones" do
      it "raises when zones is missing" do
        expect { described_class.validate!(world_fixture.except("zones")) }
          .to raise_error(Validators::ValidationError, /zones is required/)
      end

      it "raises when zones is not an object" do
        expect { described_class.validate!(world_fixture.merge("zones" => [])) }
          .to raise_error(Validators::ValidationError, /zones must be an object/)
      end

      it "raises when zones is empty" do
        expect { described_class.validate!(world_fixture.merge("zones" => {})) }
          .to raise_error(Validators::ValidationError, /zones must have at least 1 entry/)
      end

      it "raises when a zone entry is missing path" do
        zones = world_fixture["zones"].dup
        zones["goblin_cave"] = zones["goblin_cave"].except("path")
        expect { described_class.validate!(world_fixture.merge("zones" => zones)) }
          .to raise_error(Validators::ValidationError) { |e|
            expect(e.message).to match(/path is required/)
            expect(e.path).to eq("$.zones.goblin_cave.path")
          }
      end

      it "raises when a zone entry is not an object" do
        zones = world_fixture["zones"].merge("goblin_cave" => "zones/goblin-cave.json")
        expect { described_class.validate!(world_fixture.merge("zones" => zones)) }
          .to raise_error(Validators::ValidationError, /must be an object/)
      end

      it "raises when a zone entry is missing name" do
        zones = world_fixture["zones"].dup
        zones["goblin_cave"] = zones["goblin_cave"].except("name")
        expect { described_class.validate!(world_fixture.merge("zones" => zones)) }
          .to raise_error(Validators::ValidationError, /name is required/)
      end

      it "allows a zone entry with no description" do
        zones = world_fixture["zones"].dup
        zones["goblin_cave"] = zones["goblin_cave"].except("description")
        expect { described_class.validate!(world_fixture.merge("zones" => zones)) }.not_to raise_error
      end
    end

    context "worldLinks" do
      let(:bad_world_link) { world_fixture["worldLinks"][0].except("requiredKey") }

      it "raises when worldLinks is not an array" do
        expect { described_class.validate!(world_fixture.merge("worldLinks" => {})) }
          .to raise_error(Validators::ValidationError, /worldLinks must be an array/)
      end

      it "raises when requiredKey is missing from a world link" do
        data = world_fixture.merge("worldLinks" => [bad_world_link])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /requiredKey is required/)
      end

      it "raises when requiredKey is not a string or null" do
        link = world_fixture["worldLinks"][0].merge("requiredKey" => 42)
        data = world_fixture.merge("worldLinks" => [link])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /requiredKey must be a string or null/)
      end

      it "raises when zoneA is missing zone" do
        link = world_fixture["worldLinks"][0].merge("zoneA" => {"connection" => "cliff_above"})
        data = world_fixture.merge("worldLinks" => [link])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /zone is required/)
      end

      it "raises when oneWay is not a boolean" do
        link = world_fixture["worldLinks"][0].merge("oneWay" => "no")
        data = world_fixture.merge("worldLinks" => [link])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be a boolean/)
      end

      it "raises when zoneA is missing kind" do
        link = world_fixture["worldLinks"][0].merge("zoneA" => {"zone" => "goblin_cave", "connection" => "cliff_above"})
        data = world_fixture.merge("worldLinks" => [link])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end

      it "raises when zoneA's kind is not open or entryPoint" do
        link = world_fixture["worldLinks"][0].merge("zoneA" => {"zone" => "goblin_cave", "kind" => "other", "connection" => "cliff_above"})
        data = world_fixture.merge("worldLinks" => [link])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be one of/)
      end

      it "accepts a zoneA/zoneB with kind entryPoint" do
        link = {
          "zoneA" => {"zone" => "goblin_cave", "kind" => "entryPoint", "connection" => "cave_entrance/cave_mouth"},
          "zoneB" => {"zone" => "stagnant_oasis", "kind" => "open", "connection" => "goblin_trailhead"},
          "oneWay" => false,
          "requiredKey" => nil
        }
        data = world_fixture.merge("worldLinks" => [link])
        expect { described_class.validate!(data) }.not_to raise_error
      end
    end

    context "entryPoints" do
      it "raises when entryPoints is missing" do
        expect { described_class.validate!(world_fixture.except("entryPoints")) }
          .to raise_error(Validators::ValidationError, /entryPoints is required/)
      end

      it "raises when entryPoints is not an object" do
        data = world_fixture.merge("entryPoints" => ["stagnant_oasis"])
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /entryPoints must be an object/)
      end

      it "raises when entryPoints is empty" do
        expect { described_class.validate!(world_fixture.merge("entryPoints" => {})) }
          .to raise_error(Validators::ValidationError, /entryPoints must have at least 1 entry/)
      end

      it "raises when an entryPoint value is not a string or null" do
        data = world_fixture.merge("entryPoints" => {"stagnant_oasis/clearing_entrance/clearing" => 42})
        expect { described_class.validate!(data) }
          .to raise_error(Validators::ValidationError, /must be a string or null/)
      end

      it "allows an entryPoint value to be a required key string" do
        data = world_fixture.merge("entryPoints" => {"stagnant_oasis/clearing_entrance/clearing" => "barrens_pass"})
        expect { described_class.validate!(data) }.not_to raise_error
      end
    end
  end
end
