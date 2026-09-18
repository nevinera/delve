# Stubs the request sequence Github::TreeListing makes for
# Github::ContentClient#list_directory_recursive(path) - a branch lookup, one
# non-recursive tree fetch per path segment, then one recursive=1 fetch of
# the resolved subdirectory. Request specs for every editor's index/create
# actions (and any other list_directory_recursive caller) use this instead
# of stubbing the old Contents-API-per-level shape directly.
module GithubTreeStubs
  # entry_paths are relative to `path` (e.g. stub_tree_listing(repo, "items",
  # ["sword.json", "zone1/dagger.json"]) for items/sword.json and
  # items/zone1/dagger.json) - mirrors how Github::TreeListing itself
  # prefixes paths, so callers don't have to repeat the directory name.
  def stub_tree_listing(repo, path, entry_paths, branch: "main")
    stub_branch_lookup(repo, branch)
    sha = stub_segment_walk(repo, path, branch)

    blobs = entry_paths.map { |p| {path: p, type: "blob", sha: "blob-#{p}"} }
    stub_request(:get, "https://api.github.com/repos/#{repo}/git/trees/#{sha}?recursive=1")
      .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {tree: blobs}.to_json)
  end

  # For a path that doesn't exist at all - the branch lookup succeeds, but
  # the first segment isn't found in the root tree, so no further requests
  # happen (Github::TreeListing#resolve_sha returns nil early).
  def stub_missing_tree_listing(repo, path, branch: "main")
    stub_branch_lookup(repo, branch)
    stub_request(:get, "https://api.github.com/repos/#{repo}/git/trees/#{branch}")
      .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {tree: []}.to_json)
  end

  private

  def stub_branch_lookup(repo, branch)
    stub_request(:get, "https://api.github.com/repos/#{repo}")
      .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {default_branch: branch}.to_json)
  end

  # Stubs one non-recursive tree fetch per path segment, walking from
  # `branch`'s root tree down to `path`'s own resolved sha, and returns that
  # final sha (the same one stub_tree_listing then fetches recursive=1 from).
  def stub_segment_walk(repo, path, branch)
    segments = path.split("/")
    sha = branch
    segments.each_with_index do |segment, i|
      leaf_sha = "tree-sha-#{path}"
      next_sha = (i == segments.length - 1) ? leaf_sha : "tree-sha-#{segments[0..i].join("/")}"
      stub_request(:get, "https://api.github.com/repos/#{repo}/git/trees/#{sha}")
        .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {tree: [{path: segment, type: "tree", sha: next_sha}]}.to_json)
      sha = next_sha
    end
    sha
  end
end

RSpec.configure { |config| config.include GithubTreeStubs }
