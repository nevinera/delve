require "rails_helper"

RSpec.describe "Emptying a world", type: :request do
  let(:user) { create(:user) }
  let(:world) { create(:world, user:, repo: "me/thorn", name: "Thorn") }
  let(:api) { "https://api.github.com/repos/me/thorn" }
  let(:head) { "a" * 40 }

  def stub_json(verb, url, body, status: 200)
    stub_request(verb, url).to_return(status:, headers: {"Content-Type" => "application/json"}, body: body.to_json)
  end

  before do
    sign_in user
    create(:github_connection, user:)
    stub_json(:get, api, {full_name: "me/thorn", default_branch: "trunk"})
    stub_json(:get, "#{api}/git/ref/heads/trunk", {object: {sha: head}})
    stub_json(:get, "#{api}/git/commits/#{head}", {tree: {sha: "t" * 40}})
    stub_json(:get, "#{api}/git/trees/#{"t" * 40}?recursive=1", {truncated: false, tree: [
      {path: "README.md", mode: "100644", type: "blob", sha: "1" * 40, size: 10},
      {path: "world.json", mode: "100644", type: "blob", sha: "2" * 40, size: 10},
      {path: "objects", mode: "040000", type: "tree", sha: "3" * 40},
      {path: "objects/abcdefgh.json", mode: "100644", type: "blob", sha: "4" * 40, size: 10},
      {path: "places/continents/main/sketch.json", mode: "100644", type: "blob", sha: "5" * 40, size: 10},
      {path: "script/build.sh", mode: "100755", type: "blob", sha: "6" * 40, size: 10}
    ]})
  end

  it "commits a tree with only the files that aren't the world's, and a new world.json" do
    tree = stub_json(:post, "#{api}/git/trees", {sha: "n" * 40}, status: 201)
    commit = stub_json(:post, "#{api}/git/commits", {sha: "c" * 40}, status: 201)
    ref = stub_json(:patch, "#{api}/git/refs/heads/trunk", {object: {sha: "c" * 40}})

    post world_reset_path(world)

    expect(response).to redirect_to(world_path(world))
    expect(flash[:notice]).to include("Emptied me/thorn (ccccccc)")
    expect(tree.with { |req|
      entries = JSON.parse(req.body)["tree"]
      expect(entries.pluck("path")).to eq(%w[README.md script/build.sh world.json])
      expect(entries[1]).to include("mode" => "100755", "sha" => "6" * 40)
      expect(JSON.parse(entries[2]["content"])).to eq("version" => 2, "name" => "Thorn", "continents" => [{"key" => "main", "name" => "Main"}], "dungeons" => [])
      true
    }).to have_been_requested
    expect(commit.with(body: hash_including(tree: "n" * 40, parents: [head]))).to have_been_requested
    expect(ref.with(body: {sha: "c" * 40})).to have_been_requested
  end

  it "says so when GitHub won't move the branch" do
    stub_json(:post, "#{api}/git/trees", {sha: "n" * 40}, status: 201)
    stub_json(:post, "#{api}/git/commits", {sha: "c" * 40}, status: 201)
    stub_json(:patch, "#{api}/git/refs/heads/trunk", {message: "Update is not a fast forward"}, status: 422)

    post world_reset_path(world)

    expect(flash[:alert]).to include("Couldn't empty me/thorn", "422")
  end

  it "won't empty someone else's world" do
    other = create(:world, repo: "them/elm")
    post world_reset_path(other)
    expect(response).to have_http_status(:not_found)
  end
end
