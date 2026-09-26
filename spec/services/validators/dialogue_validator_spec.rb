require "rails_helper"

RSpec.describe Validators::DialogueValidator, type: :validator do
  let(:linear) do
    {
      "entry" => [{"node" => "greet"}],
      "nodes" => {
        "greet" => {"text" => "Psst. Don't go in there.", "next" => "why"},
        "why" => {"text" => "If anyone asks, you never saw me."}
      }
    }
  end

  let(:branching) do
    {
      "entry" => [{"node" => "greet"}, {"node" => "greet-annoyed"}],
      "nodes" => {
        "greet" => {"text" => "Psst.", "choices" => [{"text" => "Why not?", "next" => "why"}, {"text" => "Bye.", "next" => "bye"}]},
        "greet-annoyed" => {"text" => "Oh, it's you again.", "next" => "why"},
        "why" => {"text" => "Just trust me.", "next" => "bye"},
        "bye" => {"text" => "Never saw me."}
      }
    }
  end

  it "accepts a linear dialogue" do
    expect { described_class.validate!(linear) }.not_to raise_error
  end

  it "accepts a branching dialogue with multiple entries" do
    expect { described_class.validate!(branching) }.not_to raise_error
  end

  it "raises when entry is missing" do
    expect { described_class.validate!(linear.except("entry")) }
      .to raise_error(Validators::ValidationError, /entry is required/)
  end

  it "raises when entry is empty" do
    expect { described_class.validate!(linear.merge("entry" => [])) }
      .to raise_error(Validators::ValidationError, /entry must have at least 1 element/)
  end

  it "raises when nodes is missing" do
    expect { described_class.validate!(linear.except("nodes")) }
      .to raise_error(Validators::ValidationError, /nodes is required/)
  end

  it "raises when nodes is empty" do
    expect { described_class.validate!(linear.merge("nodes" => {})) }
      .to raise_error(Validators::ValidationError, /nodes must not be empty/)
  end

  it "raises when a node is missing text" do
    expect { described_class.validate!(linear.merge("nodes" => linear["nodes"].merge("greet" => {"next" => "why"}))) }
      .to raise_error(Validators::ValidationError, /text is required/)
  end

  it "raises when a node has both next and choices" do
    node = {"text" => "Hi.", "next" => "why", "choices" => [{"text" => "Ok", "next" => "why"}]}
    expect { described_class.validate!(linear.merge("nodes" => linear["nodes"].merge("greet" => node))) }
      .to raise_error(Validators::ValidationError, /must not have both next and choices/)
  end

  it "raises when entry references an unknown node" do
    expect { described_class.validate!(linear.merge("entry" => [{"node" => "missing"}])) }
      .to raise_error(Validators::ValidationError, /entry references unknown node/)
  end

  it "raises when an entry candidate is missing node" do
    expect { described_class.validate!(linear.merge("entry" => [{}])) }
      .to raise_error(Validators::ValidationError, /node is required/)
  end

  it "raises when a node's next references an unknown node" do
    node = linear["nodes"]["greet"].merge("next" => "missing")
    expect { described_class.validate!(linear.merge("nodes" => linear["nodes"].merge("greet" => node))) }
      .to raise_error(Validators::ValidationError, /references unknown node/)
  end

  it "raises when a choice's next references an unknown node" do
    node = branching["nodes"]["greet"]
    bad_choices = node["choices"].map { |c| c.merge("next" => "missing") }
    nodes = branching["nodes"].merge("greet" => node.merge("choices" => bad_choices))
    expect { described_class.validate!(branching.merge("nodes" => nodes)) }
      .to raise_error(Validators::ValidationError, /references unknown node/)
  end

  it "raises when a choice is missing text" do
    node = branching["nodes"]["greet"]
    bad_choices = [node["choices"].first.except("text"), node["choices"].last]
    nodes = branching["nodes"].merge("greet" => node.merge("choices" => bad_choices))
    expect { described_class.validate!(branching.merge("nodes" => nodes)) }
      .to raise_error(Validators::ValidationError, /text is required/)
  end

  it "raises when a choice is missing next" do
    node = branching["nodes"]["greet"]
    bad_choices = [node["choices"].first.except("next"), node["choices"].last]
    nodes = branching["nodes"].merge("greet" => node.merge("choices" => bad_choices))
    expect { described_class.validate!(branching.merge("nodes" => nodes)) }
      .to raise_error(Validators::ValidationError, /next is required/)
  end

  it "raises on a blank node text" do
    expect { described_class.validate!(linear.merge("nodes" => linear["nodes"].merge("greet" => {"text" => "  "}))) }
      .to raise_error(Validators::ValidationError, /text must not be empty/)
  end
end
