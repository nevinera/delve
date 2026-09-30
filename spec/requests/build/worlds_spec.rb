require "rails_helper"

RSpec.describe "Build::Worlds", type: :request do
  let(:user) { create(:user) }

  before do
    sign_in user
    create(:github_installation, user:, repo_full_name: "builder/content")
  end

  describe "GET /build/worlds" do
    before { stub_tree_listing("builder/content", "worlds", ["demo.json", "demo.layout.json", "other.json"]) }

    it "lists world files, not their layout companions" do
      get "/build/worlds"
      expect(response.body).to include(edit_build_world_path(id: "demo"), edit_build_world_path(id: "other"))
      expect(response.body).not_to include("demo.layout")
    end

    it "links to versions for a published world, and offers setup for the rest" do
      world = create(:world, owner: user, repo: "builder/content", path: "worlds/demo.json")
      get "/build/worlds"
      expect(response.body).to include(build_publishing_world_path(world))
      expect(response.body.scan("Set up publishing").size).to eq(1)
    end
  end
end
