require "rails_helper"

RSpec.describe Validators::InteractableValidator, type: :validator do
  it_behaves_like "annotatable" do
    let(:annotatable) { interactable }
  end

  let(:interactable) do
    {
      "identifier" => "snare-1",
      "name" => "Goblin Snare",
      "imageUrl" => "../../images/interactable/snare.webp",
      "usedImageUrl" => "../../images/interactable/snare-cut.webp",
      "whenUnavailable" => "used",
      "size" => {"width" => 4, "height" => 3},
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
    expect { described_class.validate!(interactable.except("usedImageUrl", "whenUnavailable", "useTime", "useText")) }.not_to raise_error
  end

  %w[identifier name imageUrl size position].each do |field|
    it "raises when #{field} is missing" do
      expect_invalid(/#{field} is required/, interactable.except(field))
    end
  end

  it "raises on an empty name or image" do
    expect_invalid(/name must not be empty/, interactable.merge("name" => " "))
    expect_invalid(/imageUrl must not be empty/, interactable.merge("imageUrl" => ""))
  end

  it "needs a used image to show as used" do
    expect_invalid(/usedImageUrl is required when whenUnavailable is "used"/, interactable.except("usedImageUrl"))
    expect { described_class.validate!(interactable.except("usedImageUrl").merge("whenUnavailable" => "hidden")) }.not_to raise_error
    expect_invalid(/must be one of/, interactable.merge("whenUnavailable" => "faded"))
  end

  it "raises on a size out of range" do
    expect_invalid(/width must be between 0.5 and 40.0/, interactable.merge("size" => {"width" => 0.1, "height" => 3}))
    expect_invalid(/height must be between/, interactable.merge("size" => {"width" => 4, "height" => 41}))
  end

  it "raises on a bad use time or text" do
    expect_invalid(/useTime must be between 0 and 30/, interactable.merge("useTime" => 31))
    expect_invalid(/useTime must be between/, interactable.merge("useTime" => -1))
    expect { described_class.validate!(interactable.merge("useTime" => 0)) }.not_to raise_error
    expect_invalid(/useText must be 40 characters or fewer/, interactable.merge("useText" => "x" * 41))
  end
end
