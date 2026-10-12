require "rails_helper"

RSpec.describe Validators::AnnotationsValidator, type: :validator do
  def expect_invalid(annotations, message, path)
    expect { described_class.validate!(annotations) }
      .to raise_error(Validators::ValidationError, message) { |e| expect(e.path).to eq(path) }
  end

  it "accepts keyword lines and prose" do
    expect { described_class.validate!({"population" => "normal; goblin 3", "plan" => "A camp. " * 100}) }.not_to raise_error
  end

  it "raises on anything but an object" do
    expect_invalid(["plan"], /must be an object/, "$")
  end

  it "raises on a key that isn't a simple lowercase word" do
    expect_invalid({"Who lives here?" => "Arren"}, /keys must be lowercase words/, "$.Who lives here?")
    expect_invalid({"a" * 41 => "too long"}, /keys must be lowercase words/, "$.#{"a" * 41}")
  end

  it "raises on a value that isn't text, or is too long" do
    expect_invalid({"population" => {"count" => 3}}, /must be a string/, "$.population")
    expect_invalid({"plan" => "x" * 4001}, /4000 characters or fewer/, "$.plan")
  end

  it "raises on more than 32 annotations" do
    expect_invalid((1..33).to_h { |i| ["note#{i}", "x"] }, /more than 32 annotations/, "$")
  end

  describe ".validate_on!" do
    it "checks data's annotations, and skips them when absent or null" do
      expect { described_class.validate_on!({"annotations" => nil}, path: "$") }.not_to raise_error
      expect { described_class.validate_on!({}, path: "$") }.not_to raise_error
      expect { described_class.validate_on!({"annotations" => {"plan" => 1}}, path: "$.maps[0]") }
        .to raise_error(Validators::ValidationError) { |e| expect(e.path).to eq("$.maps[0].annotations.plan") }
    end
  end
end
