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

  describe "GET /build/worlds/new" do
    it "asks for a key" do
      get "/build/worlds/new"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include('name="key"')
    end

    it "sends a user with no GitHub connection to connect one" do
      GithubInstallation.where(user:).delete_all
      user.reload
      get "/build/worlds/new"
      expect(response).to redirect_to(github_connect_path)
    end
  end

  describe "POST /build/worlds" do
    before { stub_tree_listing("builder/content", "worlds", ["demo.json", "sub/nested.json"]) }

    it "goes to the editor for an available key" do
      post "/build/worlds", params: {key: "northern-barrens"}
      expect(response).to redirect_to(edit_build_world_path(id: "northern-barrens"))
    end

    it "allows a key in a subdirectory" do
      post "/build/worlds", params: {key: "sub/other"}
      expect(response).to redirect_to(edit_build_world_path(id: "sub/other"))
    end

    it "rejects a blank key" do
      post "/build/worlds", params: {key: "  "}
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.body).to include("Key is required")
    end

    it "rejects a key with disallowed characters" do
      post "/build/worlds", params: {key: "no spaces"}
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.body).to include("Key must contain only")
    end

    it "rejects a key that's already taken" do
      post "/build/worlds", params: {key: "sub/nested"}
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.body).to include("is already taken")
    end
  end

  describe "GET /build/worlds/:id/edit" do
    it "suggests the next version tag for the world" do
      stub_request(:get, "https://api.github.com/repos/builder/content/git/matching-refs/tags/demo/v")
        .to_return(status: 200, headers: {"Content-Type" => "application/json"},
          body: [{ref: "refs/tags/demo/v1"}, {ref: "refs/tags/demo/v3"}, {ref: "refs/tags/demo/vx"}].to_json)
      get "/build/worlds/demo/edit"
      expect(response.body).to include('data-next-tag="demo/v4"', 'data-publish-url="/build/worlds/demo/publish"')
    end

    it "suggests v1 when the tags can't be listed" do
      stub_request(:get, "https://api.github.com/repos/builder/content/git/matching-refs/tags/demo/v")
        .to_return(status: 500, headers: {"Content-Type" => "application/json"}, body: {message: "oops"}.to_json)
      get "/build/worlds/demo/edit"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include('data-next-tag="demo/v1"')
    end

    it "suggests v1 when there are no tags yet" do
      stub_request(:get, "https://api.github.com/repos/builder/content/git/matching-refs/tags/demo/v")
        .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: [].to_json)
      get "/build/worlds/demo/edit"
      expect(response.body).to include('data-next-tag="demo/v1"')
    end
  end

  describe "POST /build/worlds/:id/publish" do
    let(:api) { "https://api.github.com/repos/builder/content" }
    let(:private_repo) { false }
    let!(:create_tag) do
      stub_request(:post, "#{api}/git/refs")
        .with(body: {ref: "refs/tags/demo/v1", sha: "c0ffee"}.to_json)
        .to_return(status: 201, headers: {"Content-Type" => "application/json"}, body: {}.to_json)
    end

    def stub_json(url, body, status: 200)
      stub_request(:get, url).to_return(status:, headers: {"Content-Type" => "application/json"}, body: body.to_json)
    end

    before do
      stub_json(api, {private: private_repo, default_branch: "master"})
      stub_json("#{api}/git/ref/heads/master", {object: {type: "commit", sha: "c0ffee"}})
      stub_json("#{api}/git/ref/tags/demo/v1", {message: "Not Found"}, status: 404)
    end

    def publish(tag: "demo/v1") = post("/build/worlds/demo/publish", params: {tag:}, as: :json)

    it "tags the default branch head and creates an importing tag version" do
      expect { publish }.to have_enqueued_job(ImportWorldVersionJob)
      expect(create_tag).to have_been_requested
      world = World.find_by!(repo: "builder/content", path: "worlds/demo.json")
      expect(world.owner).to eq(user)
      expect(world.world_versions.sole).to have_attributes(ref: "demo/v1", state: "importing")
      expect(response.parsed_body).to eq("url" => build_publishing_world_path(world))
    end

    it "reuses the world record on later publishes" do
      world = create(:world, owner: user, repo: "builder/content", path: "worlds/demo.json")
      expect { publish }.not_to change(World, :count)
      expect(world.world_versions.count).to eq(1)
    end

    it "refuses a tag that already exists" do
      stub_json("#{api}/git/ref/tags/demo/v1", {object: {type: "commit", sha: "old"}})
      expect { publish }.not_to change(WorldVersion, :count)
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["error"]).to include("already exists")
      expect(create_tag).not_to have_been_requested
    end

    it "reports GitHub refusing the tag, without creating a version" do
      remove_request_stub(create_tag)
      stub_request(:post, "#{api}/git/refs")
        .to_return(status: 403, headers: {"Content-Type" => "application/json"}, body: {message: "Resource not accessible"}.to_json)
      expect { publish }.not_to change(WorldVersion, :count)
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["error"]).to include("Resource not accessible")
    end

    it "refuses a malformed tag" do
      publish(tag: "demo v1")
      expect(response).to have_http_status(:unprocessable_content)
      expect(create_tag).not_to have_been_requested
    end

    context "with a private repo" do
      let(:private_repo) { true }

      it "refuses" do
        publish
        expect(response.parsed_body["error"]).to include("is private")
        expect(create_tag).not_to have_been_requested
      end
    end
  end
end
