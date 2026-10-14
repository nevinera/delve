require "rails_helper"

RSpec.describe Validators::InteractableValidator, type: :validator do
  it_behaves_like "annotatable" do
    let(:annotatable) { interactable }
  end

  let(:interactable) do
    {
      "identifier" => "snare-1",
      "name" => "Goblin Snare",
      "stamp" => "quest-props/goblin-snare",
      "usedStamp" => "quest-props/goblin-snare-used",
      "whenUnavailable" => "used",
      "scale" => 1.5,
      "position" => {"x" => 120.0, "y" => 340.0, "angle" => 0.0},
      "useTime" => 1,
      "useText" => "Cutting"
    }
  end

  def expect_invalid(message, data)
    expect { described_class.validate!(data) }.to raise_error(Validators::ValidationError, message)
  end

  it "accepts a full interactable, and one with only what's required" do
    expect { described_class.validate!(interactable) }.not_to raise_error
    expect { described_class.validate!(interactable.except("usedStamp", "whenUnavailable", "scale", "useTime", "useText")) }.not_to raise_error
  end

  %w[identifier name stamp position].each do |field|
    it "raises when #{field} is missing" do
      expect_invalid(/#{field} is required/, interactable.except(field))
    end
  end

  it "raises on an empty name or a stamp that doesn't name its set" do
    expect_invalid(/name must not be empty/, interactable.merge("name" => " "))
    expect_invalid(%r{stamp must be set/stamp}, interactable.merge("stamp" => "goblin-snare"))
    expect_invalid(%r{usedStamp must be set/stamp}, interactable.merge("usedStamp" => "snare-cut"))
  end

  it "shows as used without a used stamp (its own, grayed)" do
    expect { described_class.validate!(interactable.except("usedStamp")) }.not_to raise_error
    expect_invalid(/must be one of/, interactable.merge("whenUnavailable" => "faded"))
  end

  it "raises on a bad scale or variant" do
    expect_invalid(/scale must be more than 0/, interactable.merge("scale" => 0))
    expect_invalid(/usedVariant must be at least 0/, interactable.merge("usedVariant" => -1))
  end

  it "says what replaced the image fields" do
    expect_invalid(/imageUrl is gone: interactables are drawn from the zone's stamps \(stamp\)/, interactable.merge("imageUrl" => "a.png"))
    expect_invalid(/size is gone/, interactable.merge("size" => {"width" => 4, "height" => 3}))
  end

  it "raises on a bad use time or text" do
    expect_invalid(/useTime must be between 0 and 30/, interactable.merge("useTime" => 31))
    expect_invalid(/useTime must be between/, interactable.merge("useTime" => -1))
    expect { described_class.validate!(interactable.merge("useTime" => 0)) }.not_to raise_error
    expect_invalid(/useText must be 40 characters or fewer/, interactable.merge("useText" => "x" * 41))
  end
end
