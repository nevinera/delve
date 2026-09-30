require "rails_helper"

RSpec.describe WorldVersion do
  it "is valid with valid attributes" do
    expect(build(:world_version)).to be_valid
  end

  it "rejects a malformed version" do
    expect(build(:world_version, version: "1.2.3")).not_to be_valid
  end

  it "is unique per world" do
    world = create(:world)
    create(:world_version, world: world, version: "1.0")
    expect(build(:world_version, world: world, version: "1.0")).not_to be_valid
    expect(build(:world_version, version: "1.0")).to be_valid
  end

  it "allows zones with the same key across versions" do
    world = create(:world)
    v1 = create(:world_version, world: world, version: "1.0")
    v2 = create(:world_version, world: world, version: "1.1")
    create(:zone, world_version: v1, key: "cave", identifier: "cave", version: "1.0")
    expect(build(:zone, world_version: v2, key: "cave", identifier: "cave", version: "1.1")).to be_valid
    expect(build(:zone, world_version: v1, key: "cave", identifier: "cave2", version: "1.2")).not_to be_valid
  end
end
