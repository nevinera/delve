require "rails_helper"

RSpec.describe "Build::Publishing::Worlds", type: :request do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }

  context "when not logged in" do
    it "redirects index to login" do
      get "/build/publishing/worlds"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before do
      sign_in user
      create(:github_installation, user:, repo_full_name: "builder/content")
    end

    describe "GET /build/publishing/worlds" do
      it "lists only the user's worlds" do
        create(:world, owner: user, path: "worlds/mine.json")
        create(:world, owner: other_user, path: "worlds/theirs.json")
        get "/build/publishing/worlds"
        expect(response).to have_http_status(:ok)
        expect(response.body).to include("mine")
        expect(response.body).not_to include("theirs")
      end
    end

    describe "GET /build/publishing/worlds/:id" do
      let(:world) { create(:world, owner: user) }

      it "lists versions with their state and actions" do
        create(:world_version, world:, ref: "demo/v1")
        create(:world_version, :beta, world:)
        create(:world_version, world:, ref: "demo/v0", state: "failed", validity_error: "zones/x.full.json: HTTP 404")
        get "/build/publishing/worlds/#{world.id}"
        expect(response).to have_http_status(:ok)
        expect(response.body).to include("demo/v1", "master", "zones/x.full.json: HTTP 404", "Release", "Reimport")
      end

      it "shows share links for betas and unreleased versions but not released ones" do
        beta = create(:world_version, :beta, world:)
        released = create(:world_version, :released, world:)
        get "/build/publishing/worlds/#{world.id}"
        expect(response.body).to include(beta.share_token)
        expect(response.body).not_to include(released.share_token)
      end

      it "auto-refreshes while a version is importing" do
        create(:world_version, :importing, world:)
        get "/build/publishing/worlds/#{world.id}"
        expect(response.body).to include('http-equiv="refresh"')
      end

      it "returns 404 for another user's world" do
        get "/build/publishing/worlds/#{create(:world, owner: other_user).id}"
        expect(response).to have_http_status(:not_found)
      end
    end

    describe "POST /build/publishing/worlds" do
      it "creates a world for the linked repo and redirects to it" do
        expect { post "/build/publishing/worlds", params: {path: "worlds/demo.json"} }.to change(World, :count).by(1)
        world = World.last
        expect(world).to have_attributes(owner: user, repo: "builder/content", path: "worlds/demo.json")
        expect(response).to redirect_to(build_publishing_world_path(world))
      end

      it "reuses an existing world" do
        world = create(:world, owner: user, repo: "builder/content", path: "worlds/demo.json")
        expect { post "/build/publishing/worlds", params: {path: "worlds/demo.json"} }.not_to change(World, :count)
        expect(response).to redirect_to(build_publishing_world_path(world))
      end

      it "rejects a path outside worlds/" do
        expect { post "/build/publishing/worlds", params: {path: "zones/demo.json"} }.not_to change(World, :count)
        expect(response).to redirect_to(build_worlds_path)
      end
    end
  end
end
