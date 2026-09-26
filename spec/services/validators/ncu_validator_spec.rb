require "rails_helper"

RSpec.describe Validators::NcuValidator, type: :validator do
  let(:ncu) do
    {
      "identifier" => "grizzle",
      "name" => "Grizzle",
      "tokenImageUrl" => "../../tokens/unit/goblin-2.webp",
      "tokenRadius" => 2.0,
      "position" => {"x" => 10.0, "y" => 10.0, "angle" => 180.0},
      "movement" => {"type" => "wander", "location" => {"x" => 10.0, "y" => 10.0}, "radius" => 4.0, "speed" => 0.3, "waitTime" => [4.0, 8.0]},
      "dialogue" => {"entry" => [{"node" => "greet"}], "nodes" => {"greet" => {"text" => "Psst. Don't go in there."}}}
    }
  end

  it "accepts a full NCU" do
    expect { described_class.validate!(ncu) }.not_to raise_error
  end

  it "accepts an NCU with no movement or dialogue" do
    expect { described_class.validate!(ncu.except("movement", "dialogue")) }.not_to raise_error
  end

  %w[identifier name tokenImageUrl tokenRadius position].each do |field|
    it "raises when #{field} is missing" do
      expect { described_class.validate!(ncu.except(field)) }
        .to raise_error(Validators::ValidationError, /#{field} is required/)
    end
  end

  it "raises on an out-of-range tokenRadius" do
    expect { described_class.validate!(ncu.merge("tokenRadius" => 25)) }
      .to raise_error(Validators::ValidationError, /tokenRadius must be between/)
  end

  it "raises on an out-of-range speedFactor" do
    expect { described_class.validate!(ncu.merge("speedFactor" => 11)) }
      .to raise_error(Validators::ValidationError, /speedFactor must be between/)
  end

  it "validates movement like a unit's" do
    expect { described_class.validate!(ncu.merge("movement" => {"type" => "fly"})) }
      .to raise_error(Validators::ValidationError) { |e| expect(e.path).to match(/movement/) }
  end

  it "validates dialogue like a standalone tree, surfacing the nested path" do
    expect { described_class.validate!(ncu.merge("dialogue" => {"entry" => [{"node" => "missing"}], "nodes" => ncu["dialogue"]["nodes"]})) }
      .to raise_error(Validators::ValidationError) { |e| expect(e.path).to match(/dialogue/) }
  end
end
