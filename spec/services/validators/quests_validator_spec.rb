require "rails_helper"

RSpec.describe Validators::QuestsValidator, type: :validator do
  def quest(identifier, chain: "chain", chain_name: "Chain")
    {
      "identifier" => identifier, "name" => identifier, "chainIdentifier" => chain, "chainName" => chain_name,
      "offeredBy" => {"zone" => "z", "ncu" => "n"}, "turnIn" => {"zone" => "z", "ncu" => "n"}, "offerText" => "Hi."
    }
  end

  def validate!(data) = described_class.validate!(data)

  it "accepts an empty file" do
    expect { validate!([]) }.not_to raise_error
  end

  it "accepts quests in several chains" do
    expect { validate!([quest("a"), quest("b"), quest("c", chain: "other", chain_name: "Other")]) }.not_to raise_error
  end

  it "rejects a non-array" do
    expect { validate!({}) }.to raise_error(Validators::ValidationError, /must be an array of quests/)
  end

  it "validates each quest, with its index in the path" do
    expect { validate!([quest("a"), quest("b").except("name")]) }
      .to raise_error(Validators::ValidationError, /name is required.*\$\[1\]\.name/)
  end

  it "rejects duplicate identifiers" do
    expect { validate!([quest("a"), quest("a")]) }
      .to raise_error(Validators::ValidationError, /duplicate quest identifier "a".*\$\[1\]\.identifier/)
  end

  it "rejects a chain with two names" do
    expect { validate!([quest("a"), quest("b", chain_name: "Other")]) }
      .to raise_error(Validators::ValidationError, /chainName must match.*\$\[1\]\.chainName/)
  end
end
