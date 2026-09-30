require "rails_helper"

RSpec.describe World do
  it "is valid with valid attributes" do
    expect(build(:world)).to be_valid
  end

  it "requires a lowercase-and-underscore identifier" do
    expect(build(:world, identifier: "Bad-Id")).not_to be_valid
  end

  it "requires a unique identifier" do
    create(:world, identifier: "demo_core")
    expect(build(:world, identifier: "demo_core")).not_to be_valid
  end

  describe "#latest_version" do
    let(:world) { create(:world) }

    it "is the numerically highest fetched version" do
      create(:world_version, world: world, version: "1.9")
      newest = create(:world_version, world: world, version: "1.10")
      expect(world.latest_version).to eq(newest)
    end

    it "ignores versions that are not published" do
      published = create(:world_version, world: world, version: "1.1")
      create(:world_version, world: world, version: "1.2", state: "validation_failed")
      create(:world_version, world: world, version: "1.3", state: "provided")
      expect(world.latest_version).to eq(published)
    end

    it "is nil when nothing is published" do
      expect(world.latest_version).to be_nil
    end
  end
end
