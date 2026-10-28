require "rails_helper"

RSpec.describe Character do
  it "capitalizes its name" do
    expect(build(:character, name: " aRWEN ").name).to eq("Arwen")
  end

  it "takes letters from any alphabet" do
    expect(build(:character, name: "Éowyn")).to be_valid
  end

  it "keeps names between 2 and 16 letters" do
    expect(build(:character, name: "A")).not_to be_valid
    expect(build(:character, name: "A" * 17)).not_to be_valid
  end

  it "needs its look to be an object" do
    expect(build(:character, look: ["hair"])).not_to be_valid
  end

  it "refuses a look that's too large" do
    expect(build(:character, look: {"notes" => "x" * 9000})).not_to be_valid
  end
end
