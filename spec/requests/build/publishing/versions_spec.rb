require "rails_helper"

RSpec.describe "Build::Publishing::Versions", type: :request do
  include ActiveJob::TestHelper

  let(:user) { create(:user) }
  let(:world) { create(:world, owner: user, repo: "builder/content") }
  let(:api) { "https://api.github.com/repos/builder/content" }
  let(:private_repo) { false }

  def stub_json(url, body, status: 200)
    stub_request(:get, url).to_return(status:, headers: {"Content-Type" => "application/json"}, body: body.to_json)
  end

  before do
    sign_in user
    create(:github_installation, user:, repo_full_name: "builder/content")
    stub_json(api, {private: private_repo, default_branch: "master"})
  end

  describe "GET new" do
    it "renders the tag form" do
      get "/build/publishing/worlds/#{world.id}/versions/new"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include("Import tag")
    end

    it "returns 404 for another user's world" do
      get "/build/publishing/worlds/#{create(:world).id}/versions/new"
      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST create" do
    def create_version(ref:)
      post "/build/publishing/worlds/#{world.id}/versions", params: {world_version: {ref:}}
    end

    context "with an existing tag" do
      before { stub_json("#{api}/git/ref/tags/demo/v1", {object: {type: "commit", sha: "c0ffee"}}) }

      it "creates the version and enqueues its import" do
        expect { create_version(ref: "demo/v1") }.to have_enqueued_job(ImportWorldVersionJob)
        version = world.world_versions.last
        expect(version).to have_attributes(ref: "demo/v1", state: "importing")
        expect(response).to redirect_to(build_publishing_world_path(world))
      end

      it "rejects a ref that's already a version" do
        create(:world_version, world:, ref: "demo/v1")
        expect { create_version(ref: "demo/v1") }.not_to change(WorldVersion, :count)
        expect(response).to have_http_status(:unprocessable_content)
      end

      context "with a private repo" do
        let(:private_repo) { true }

        it "refuses" do
          expect { create_version(ref: "demo/v1") }.not_to change(WorldVersion, :count)
          expect(response.body).to include("is private")
        end
      end
    end

    it "rejects a tag that doesn't exist" do
      stub_json("#{api}/git/ref/tags/nope", {message: "Not Found"}, status: 404)
      expect { create_version(ref: "nope") }.not_to change(WorldVersion, :count)
      expect(response.body).to include("Tag &quot;nope&quot; doesn&#39;t exist")
    end

    it "refuses when the linked repo isn't the world's repo" do
      world.update!(repo: "builder/other")
      expect { create_version(ref: "demo/v1") }.not_to change(WorldVersion, :count)
      expect(response.body).to include("points at builder/content")
    end
  end

  describe "POST release" do
    it "releases an unreleased tag version" do
      version = create(:world_version, world:)
      post "/build/publishing/worlds/#{world.id}/versions/#{version.id}/release"
      expect(version.reload).to be_released
      expect(response).to redirect_to(build_publishing_world_path(world))
    end

    it "refuses a version that's already released" do
      version = create(:world_version, :released, world:)
      post "/build/publishing/worlds/#{world.id}/versions/#{version.id}/release"
      expect(flash[:alert]).to be_present
    end
  end

  describe "POST reimport" do
    it "reimports a failed version" do
      version = create(:world_version, world:, state: "failed", validity_error: "boom")
      expect { post "/build/publishing/worlds/#{world.id}/versions/#{version.id}/reimport" }
        .to have_enqueued_job(ImportWorldVersionJob).with(version.id)
      expect(version.reload).to have_attributes(state: "importing", validity_error: nil)
    end

    it "refuses an unreleased version" do
      version = create(:world_version, world:)
      expect { post "/build/publishing/worlds/#{world.id}/versions/#{version.id}/reimport" }
        .not_to have_enqueued_job(ImportWorldVersionJob)
      expect(version.reload).to be_unreleased
    end

    it "refuses a released version" do
      version = create(:world_version, :released, world:)
      expect { post "/build/publishing/worlds/#{world.id}/versions/#{version.id}/reimport" }
        .not_to have_enqueued_job(ImportWorldVersionJob)
      expect(version.reload).to be_released
    end
  end
end
