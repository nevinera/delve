require "rails_helper"

RSpec.describe Github::TreeListing do
  let(:repo) { "nevinera/delve-content" }
  let(:token) { "gho_fresh" }

  def stub_repo(default_branch: "main")
    stub_request(:get, "https://api.github.com/repos/#{repo}")
      .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {default_branch: default_branch}.to_json)
  end

  def stub_tree(sha, entries, recursive: false)
    url = "https://api.github.com/repos/#{repo}/git/trees/#{sha}"
    url += "?recursive=1" if recursive
    stub_request(:get, url)
      .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {sha: sha, tree: entries}.to_json)
  end

  describe "#list" do
    it "resolves a single-segment path's tree sha, then lists it recursively in one call" do
      stub_repo
      stub_tree("main", [{path: "abilities", type: "tree", sha: "abilities-sha"}])
      stub_tree("abilities-sha", [
        {path: "punch.json", type: "blob", sha: "s1"},
        {path: "classes/druid/wildshape.json", type: "blob", sha: "s2"}
      ], recursive: true)

      result = described_class.new(token, repo).list("abilities")

      expect(result).to contain_exactly(
        {"name" => "punch.json", "path" => "abilities/punch.json", "type" => "file"},
        {"name" => "wildshape.json", "path" => "abilities/classes/druid/wildshape.json", "type" => "file"}
      )
    end

    it "resolves a multi-segment path by walking one non-recursive lookup per segment" do
      stub_repo
      stub_tree("main", [{path: "abilities", type: "tree", sha: "abilities-sha"}])
      stub_tree("abilities-sha", [{path: "units", type: "tree", sha: "units-sha"}])
      stub_tree("units-sha", [{path: "goblin.json", type: "blob", sha: "s1"}], recursive: true)

      result = described_class.new(token, repo).list("abilities/units")

      expect(result).to contain_exactly({"name" => "goblin.json", "path" => "abilities/units/goblin.json", "type" => "file"})
    end

    it "returns an empty array when the path doesn't exist" do
      stub_repo
      stub_tree("main", [{path: "abilities", type: "tree", sha: "abilities-sha"}])

      result = described_class.new(token, repo).list("items")

      expect(result).to eq([])
    end

    it "returns an empty array for an existing, empty directory" do
      stub_repo
      stub_tree("main", [{path: "items", type: "tree", sha: "items-sha"}])
      stub_tree("items-sha", [], recursive: true)

      expect(described_class.new(token, repo).list("items")).to eq([])
    end

    it "excludes tree (directory) entries from the recursive result, keeping only blobs" do
      stub_repo
      stub_tree("main", [{path: "items", type: "tree", sha: "items-sha"}])
      stub_tree("items-sha", [
        {path: "dagger.json", type: "blob", sha: "s1"},
        {path: "zone1", type: "tree", sha: "s2"},
        {path: "zone1/sword.json", type: "blob", sha: "s3"}
      ], recursive: true)

      result = described_class.new(token, repo).list("items")

      expect(result).to contain_exactly(
        {"name" => "dagger.json", "path" => "items/dagger.json", "type" => "file"},
        {"name" => "sword.json", "path" => "items/zone1/sword.json", "type" => "file"}
      )
    end
  end
end
