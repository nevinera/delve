require "rails_helper"

RSpec.describe CharacterClasses::IconUrl do
  let(:location) { "https://raw.githubusercontent.com/example/content/main/classes/puncher.full.json" }

  def resolve(icon_url)
    described_class.call(icon_url: icon_url, location: location)
  end

  it "resolves a relative path against the class location" do
    expect(resolve("../graphics/icons/punch.svg"))
      .to eq("https://raw.githubusercontent.com/example/content/main/graphics/icons/punch.svg")
  end

  it "passes an absolute URL through" do
    expect(resolve("https://cdn.example.com/punch.svg")).to eq("https://cdn.example.com/punch.svg")
  end

  it "resolves a stock icon reference to the server-hosted icon" do
    expect(resolve(":heal:")).to eq("/abilities/icons/heal.svg")
  end

  it "returns nil for an unknown stock icon" do
    expect(resolve(":nope:")).to be_nil
  end

  it "returns nil for a blank icon" do
    expect(resolve(nil)).to be_nil
    expect(resolve("")).to be_nil
  end

  it "returns nil for an unparseable path" do
    expect(resolve("not a url::")).to be_nil
  end
end
