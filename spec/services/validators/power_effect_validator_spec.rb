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
    describe "groundArea" do
      let(:ground_area) do
        {
          "type" => "groundArea",
          "shape" => {"type" => "circle", "at" => "target", "radius" => 8.0},
          "affects" => "bAll",
          "range" => 30.0,
          "duration" => 12.0,
          "onTick" => [{"type" => "harm", "amount" => [2.0, 3.0], "school" => "magic"}],
          "graphic" => {"color" => "#ff5a1f", "opacity" => 0.5}
        }
      end

      def with_shape(**shape)
        ground_area.merge("shape" => shape.transform_keys(&:to_s))
      end

      it "accepts a circle on the target with a range" do
        expect { described_class.validate!(ground_area) }.not_to raise_error
      end

      it "accepts a burst-style circle on self without a range" do
        effect = with_shape(type: "circle", at: "self", radius: 6).except("range")
        expect { described_class.validate!(effect) }.not_to raise_error
      end

      it "rejects a cone whose offset reaches its length" do
        effect = with_shape(type: "cone", offset: 25, length: 25, width: 20)
        expect { described_class.validate!(effect) }.to raise_error(Validators::ValidationError, /offset must be less than length/)
      end

      it "accepts rings, lines and cones" do
        ring = with_shape(type: "ring", at: "self", innerRadius: 4, outerRadius: 9).except("range")
        line = with_shape(type: "line", length: 30, width: 4, direction: "facing").except("range")
        cone = with_shape(type: "cone", offset: 3, length: 25, width: 20)
        [ring, line, cone].each { |effect| expect { described_class.validate!(effect) }.not_to raise_error }
      end

      it "requires a range when the shape is anchored on the target" do
        expect { described_class.validate!(ground_area.except("range")) }
          .to raise_error(Validators::ValidationError, /range is required/)
        expect { described_class.validate!(with_shape(type: "cone", length: 25, width: 20, direction: "target").except("range")) }
          .to raise_error(Validators::ValidationError, /range is required/)
      end

      it "rejects an unknown shape or affects" do
        expect { described_class.validate!(with_shape(type: "blob")) }.to raise_error(Validators::ValidationError, /must be one of/)
        expect { described_class.validate!(ground_area.merge("affects" => "bTarget")) }.to raise_error(Validators::ValidationError, /must be one of/)
      end

      it "rejects a ring whose outer radius doesn't exceed its inner radius" do
        effect = with_shape(type: "ring", at: "self", innerRadius: 5, outerRadius: 5).except("range")
        expect { described_class.validate!(effect) }.to raise_error(Validators::ValidationError, /outerRadius must be greater than innerRadius/)
      end

      it "rejects a non-positive duration, tickInterval or size" do
        expect { described_class.validate!(ground_area.merge("duration" => 0)) }.to raise_error(Validators::ValidationError, /duration must be greater than 0/)
        expect { described_class.validate!(ground_area.merge("tickInterval" => 0)) }.to raise_error(Validators::ValidationError, /tickInterval must be greater than 0/)
        expect { described_class.validate!(with_shape(type: "circle", at: "target", radius: 0)) }.to raise_error(Validators::ValidationError, /radius must be greater than 0/)
      end

      it "requires at least one onTick effect and rejects nested areas" do
        expect { described_class.validate!(ground_area.merge("onTick" => [])) }.to raise_error(Validators::ValidationError, /at least 1/)
        nested = ground_area.merge("onTick" => [ground_area])
        expect { described_class.validate!(nested) }.to raise_error(Validators::ValidationError, /must be one of/)
      end

      it "validates the nested effects" do
        expect { described_class.validate!(ground_area.merge("onTick" => [{"type" => "harm"}])) }
          .to raise_error(Validators::ValidationError, /amount is required/)
        resource = {"type" => "resource", "resourceName" => "energy", "delta" => 1}
        expect { described_class.validate!(ground_area.merge("onTick" => [resource])) }.not_to raise_error
      end

      it "validates the graphic" do
        expect { described_class.validate!(ground_area.merge("graphic" => {"color" => "red"})) }.to raise_error(Validators::ValidationError, /6-digit hex/)
        expect { described_class.validate!(ground_area.merge("graphic" => {"opacity" => 1.5})) }.to raise_error(Validators::ValidationError, /opacity must be between/)
        expect { described_class.validate!(ground_area.merge("graphic" => {"textureURL" => ":nonesuch:"})) }.to raise_error(Validators::ValidationError, /not a recognized stock asset/)
      end
    end

    describe "shape on an instant effect" do
      let(:cone) { {"type" => "cone", "length" => 20, "width" => 10} }

      it "accepts a bAll or gAll effect with a self-anchored shape and no range" do
        expect { described_class.validate!(harm_effect.except("range").merge("affects" => "bAll", "shape" => cone)) }.not_to raise_error
        expect { described_class.validate!(heal_effect.except("range").merge("affects" => "gAll", "shape" => {"type" => "circle", "at" => "self", "radius" => 5})) }.not_to raise_error
      end

      it "requires a range when the shape aims at the target" do
        aimed = cone.merge("direction" => "target")
        expect { described_class.validate!(harm_effect.except("range").merge("affects" => "bAll", "shape" => aimed)) }
          .to raise_error(Validators::ValidationError, /range/)
        expect { described_class.validate!(harm_effect.merge("affects" => "bAll", "shape" => aimed)) }.not_to raise_error
      end

      it "rejects a shape on a single-target effect" do
        expect { described_class.validate!(harm_effect.merge("affects" => "bTarget", "shape" => cone)) }
          .to raise_error(Validators::ValidationError, /affects/)
      end

      it "validates the shape itself" do
        expect { described_class.validate!(harm_effect.merge("affects" => "bAll", "shape" => cone.merge("width" => 0))) }
          .to raise_error(Validators::ValidationError, /width must be greater than 0/)
      end
    end

    describe "radius" do
      it "accepts a positive radius on a bTarget or gTarget effect" do
        expect { described_class.validate!(harm_effect.merge("affects" => "bTarget", "radius" => 6)) }.not_to raise_error
        expect { described_class.validate!(heal_effect.merge("affects" => "gTarget", "radius" => 4.5)) }.not_to raise_error
      end

      it "rejects a radius on an effect that isn't aimed at a target" do
        expect { described_class.validate!(harm_effect.merge("affects" => "bAll", "radius" => 6)) }
          .to raise_error(Validators::ValidationError, /radius only applies to bTarget and gTarget effects/)
      end

      it "rejects a zero or negative radius" do
        expect { described_class.validate!(harm_effect.merge("affects" => "bTarget", "radius" => 0)) }
          .to raise_error(Validators::ValidationError, /radius must be greater than 0/)
      end
    end

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

    it "accepts a resource effect on the target with a range" do
      expect { described_class.validate!(resource_effect.merge("affects" => "bTarget", "range" => [1.0, 5.0])) }.not_to raise_error
    end

    it "requires a range for a resource effect on the target" do
      expect { described_class.validate!(resource_effect.merge("affects" => "bTarget")) }
        .to raise_error(Validators::ValidationError, /range/)
    end

    it "rejects a malformed range on a resource effect" do
      expect { described_class.validate!(resource_effect.merge("affects" => "bTarget", "range" => "far")) }
        .to raise_error(Validators::ValidationError, /must be a number or \[min, max\] range/)
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

      it "allows school to be omitted" do
        expect { described_class.validate!(harm_effect.except("school")) }.not_to raise_error
      end

      it "allows school explicitly null - the editor clears a field this way, not by deleting its key" do
        expect { described_class.validate!(harm_effect.merge("school" => nil)) }.not_to raise_error
      end

      it "allows school magic" do
        expect { described_class.validate!(harm_effect.merge("school" => "magic")) }.not_to raise_error
      end

      it "raises when school is not a recognized value" do
        expect { described_class.validate!(harm_effect.merge("school" => "fire")) }
          .to raise_error(Validators::ValidationError, /must be one of/)
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

      it "accepts tags explicitly null, same as omitted" do
        expect { described_class.validate!(harm_effect.merge("tags" => nil)) }.not_to raise_error
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
