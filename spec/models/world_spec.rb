require "rails_helper"

RSpec.describe World, type: :model do
  describe "validations" do
    it "is valid with valid attributes" do
      expect(build(:world)).to be_valid
    end

    it "requires a username/reponame repo" do
      expect(build(:world, repo: "content")).not_to be_valid
      expect(build(:world, repo: "a/b/c")).not_to be_valid
    end

    it "requires a worlds/*.json path" do
      expect(build(:world, path: "zones/demo.json")).not_to be_valid
      expect(build(:world, path: "worlds/demo.full")).not_to be_valid
      expect(build(:world, path: "worlds/sub/demo.json")).to be_valid
    end

    it "requires path to be unique within a repo" do
      create(:world, repo: "a/b", path: "worlds/x.json")
      expect(build(:world, repo: "a/b", path: "worlds/x.json")).not_to be_valid
      expect(build(:world, repo: "a/c", path: "worlds/x.json")).to be_valid
    end
  end

  describe "#key" do
    it "matches the world editor's key" do
      expect(build(:world, path: "worlds/sub/demo-core.json").key).to eq("sub/demo-core")
    end
  end

  describe "#released_versions" do
    it "lists available versions, newest release first" do
      world = create(:world)
      older = create(:world_version, :released, world:, released_at: 2.days.ago)
      newer = create(:world_version, :released, world:, released_at: 1.day.ago)
      create(:world_version, :released, world:, expires_at: 1.minute.ago)
      create(:world_version, world:)
      expect(world.released_versions).to eq([newer, older])
    end
  end
end
