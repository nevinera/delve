require "rails_helper"

RSpec.describe "Build::WorldEditor", type: :request do
  let(:user) { create(:user) }
  let(:api) { "https://api.github.com/repos/builder/content" }

  before { sign_in user }

  def stub_json(url, body, status: 200)
    stub_request(:get, url).to_return(status:, headers: {"Content-Type" => "application/json"}, body: body.to_json)
  end

  describe "GET /build/world_editor/:id" do
    it "mounts the editor for the world, with publishing set up" do
      create(:github_installation, user:, repo_full_name: "builder/content")
      stub_json("#{api}/git/matching-refs/tags/small/v", [{ref: "refs/tags/small/v2"}])
      get "/build/world_editor/small"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include(
        'data-key="small"', %(data-back-url="#{build_worlds_path}"),
        'data-publish-url="/build/world_editor/small/publish"', 'data-next-tag="small/v3"'
      )
    end

    it "sends a user with no GitHub connection to connect one" do
      get "/build/world_editor/small"
      expect(response).to redirect_to(github_connect_path)
    end
  end

  describe "POST /build/world_editor/:id/publish" do
    let!(:create_tag) do
      stub_request(:post, "#{api}/git/refs")
        .with(body: {ref: "refs/tags/small/v1", sha: "expanded"}.to_json)
        .to_return(status: 201, headers: {"Content-Type" => "application/json"}, body: {}.to_json)
    end

    before do
      create(:github_installation, user:, repo_full_name: "builder/content")
      stub_json(api, {private: false, default_branch: "main"})
      stub_json("#{api}/git/ref/tags/small/v1", {message: "Not Found"}, status: 404)
      stub_json("#{api}/git/ref/heads/world-editor", {object: {type: "commit", sha: "expanded"}})
    end

    def publish(branch: "world-editor", expected_sha: "expanded")
      post "/build/world_editor/small/publish", params: {tag: "small/v1", branch:, expected_sha:}, as: :json
    end

    it "tags the expanded commit and records a version of the self-contained world" do
      expect { publish }.to have_enqueued_job(ImportWorldVersionJob)
      expect(create_tag).to have_been_requested
      world = World.find_by!(repo: "builder/content", path: "worlds/small/small.json")
      expect(world.owner).to eq(user)
      expect(world.world_versions.sole.ref).to eq("small/v1")
      expect(response.parsed_body).to eq("url" => build_publishing_world_path(world))
    end

    it "refuses when the branch has moved on since it was expanded" do
      expect { publish(expected_sha: "older") }.not_to change(WorldVersion, :count)
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["error"]).to include("has moved on since it was expanded")
      expect(create_tag).not_to have_been_requested
    end

    it "refuses a branch that doesn't exist" do
      stub_json("#{api}/git/ref/heads/gone", {message: "Not Found"}, status: 404)
      publish(branch: "gone")
      expect(response.parsed_body["error"]).to eq("Branch gone doesn't exist.")
    end

    it "requires the branch and expanded commit" do
      publish(branch: "", expected_sha: "")
      expect(response.parsed_body["error"]).to include("branch and its expanded commit are required")
    end
  end
end
