require "rails_helper"

RSpec.describe "Build::Worlds", type: :request do
  let(:user) { create(:user) }

  before do
    sign_in user
    create(:github_installation, user:, repo_full_name: "builder/content")
  end

  describe "GET /build/worlds" do
    def stub_branches(*names)
      stub_request(:get, "https://api.github.com/repos/builder/content/git/matching-refs/heads/")
        .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: names.map { |name| {ref: "refs/heads/#{name}"} }.to_json)
    end

    before { stub_branches("main", "world-editor") }

    it "lists the default branch's self-contained worlds, linking to the editor on that branch" do
      stub_tree_listing("builder/content", "worlds", ["small/small.json", "small/zones/forest/forest.json", "demo.json", "demo.layout.json"])
      get "/build/worlds"
      expect(response.body).to include(edit_build_world_path(id: "small", branch: "main"))
      expect(response.body).not_to include("forest", "demo")
    end

    it "lists another branch's worlds when it's picked" do
      stub_tree_listing("builder/content", "worlds", ["small/small.json"], branch: "world-editor")
      stub_request(:get, "https://api.github.com/repos/builder/content")
        .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {default_branch: "main"}.to_json)
      get "/build/worlds", params: {branch: "world-editor"}
      expect(response.body).to include(edit_build_world_path(id: "small", branch: "world-editor"), new_build_world_path(branch: "world-editor"))
      expect(response.body).to include('<option selected="selected" value="world-editor">')
    end

    it "falls back to the default branch for one that doesn't exist" do
      stub_tree_listing("builder/content", "worlds", ["small/small.json"])
      get "/build/worlds", params: {branch: "gone"}
      expect(response.body).to include(edit_build_world_path(id: "small", branch: "main"))
    end

    it "says so when the branch has no worlds" do
      stub_tree_listing("builder/content", "worlds", ["demo.json"])
      get "/build/worlds"
      expect(response.body).to include("No worlds on main yet.")
    end

    it "links to versions for a published world, and offers setup for the rest" do
      stub_tree_listing("builder/content", "worlds", ["small/small.json", "other/other.json"])
      world = create(:world, owner: user, repo: "builder/content", path: "worlds/small/small.json")
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
    before { stub_tree_listing("builder/content", "worlds", ["demo.json", "small/small.json"]) }

    it "goes to the editor for an available key" do
      post "/build/worlds", params: {key: "northern-barrens"}
      expect(response).to redirect_to(edit_build_world_path(id: "northern-barrens"))
    end

    it "keeps the branch it was started from" do
      stub_tree_listing("builder/content", "worlds", [], branch: "world-editor")
      post "/build/worlds", params: {key: "northern-barrens", branch: "world-editor"}
      expect(response).to redirect_to(edit_build_world_path(id: "northern-barrens", branch: "world-editor"))
    end

    it "rejects a blank key" do
      post "/build/worlds", params: {key: "  "}
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.body).to include("Key is required")
    end

    it "rejects a key with disallowed characters" do
      post "/build/worlds", params: {key: "sub/other"}
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.body).to include("Key must contain only")
    end

    it "rejects a key that's already taken, in either layout" do
      %w[small demo].each do |key|
        post "/build/worlds", params: {key:}
        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("is already taken")
      end
    end
  end

  describe "GET /build/worlds/:id/edit" do
    it "mounts the editor for the world" do
      stub_request(:get, "https://api.github.com/repos/builder/content/git/matching-refs/tags/small/v")
        .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: [].to_json)
      get "/build/worlds/small/edit"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include('data-key="small"', %(data-back-url="#{build_worlds_path}"))
      expect(response.body).to include("data-stock-assets=")
      expect(response.body).to include('data-zone-play-url="/build/worlds/small/zones/ZONE/play"')
      expect(response.body).to match(%r{src="/client/worldBuilder[^"]*\.js"})
    end

    it "sends a user with no GitHub connection to connect one" do
      GithubInstallation.where(user:).delete_all
      user.reload
      get "/build/worlds/small/edit"
      expect(response).to redirect_to(github_connect_path)
    end

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
        .with(body: {ref: "refs/tags/small/v1", sha: "expanded"}.to_json)
        .to_return(status: 201, headers: {"Content-Type" => "application/json"}, body: {}.to_json)
    end

    def stub_json(url, body, status: 200)
      stub_request(:get, url).to_return(status:, headers: {"Content-Type" => "application/json"}, body: body.to_json)
    end

    before do
      stub_json(api, {private: private_repo, default_branch: "main"})
      stub_json("#{api}/git/ref/tags/small/v1", {message: "Not Found"}, status: 404)
      stub_json("#{api}/git/ref/heads/world-editor", {object: {type: "commit", sha: "expanded"}})
    end

    def publish(tag: "small/v1", branch: "world-editor", expected_sha: "expanded")
      post "/build/worlds/small/publish", params: {tag:, branch:, expected_sha:}, as: :json
    end

    it "tags the expanded commit and records a version of the self-contained world" do
      expect { publish }.to have_enqueued_job(ImportWorldVersionJob)
      expect(create_tag).to have_been_requested
      world = World.find_by!(repo: "builder/content", path: "worlds/small/small.json")
      expect(world.owner).to eq(user)
      expect(world.world_versions.sole).to have_attributes(ref: "small/v1", state: "importing")
      expect(response.parsed_body).to eq("url" => build_publishing_world_path(world))
    end

    it "reuses the world record on later publishes" do
      world = create(:world, owner: user, repo: "builder/content", path: "worlds/small/small.json")
      expect { publish }.not_to change(World, :count)
      expect(world.world_versions.count).to eq(1)
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

    it "refuses a tag that already exists" do
      stub_json("#{api}/git/ref/tags/small/v1", {object: {type: "commit", sha: "old"}})
      expect { publish }.not_to change(WorldVersion, :count)
      expect(response.parsed_body["error"]).to include("already exists")
      expect(create_tag).not_to have_been_requested
    end

    it "reports GitHub refusing the tag, without creating a version" do
      remove_request_stub(create_tag)
      stub_request(:post, "#{api}/git/refs")
        .to_return(status: 403, headers: {"Content-Type" => "application/json"}, body: {message: "Resource not accessible"}.to_json)
      expect { publish }.not_to change(WorldVersion, :count)
      expect(response.parsed_body["error"]).to include("Resource not accessible")
    end

    it "refuses a malformed tag" do
      publish(tag: "small v1")
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
