module Github
  # Lists every file under a directory, at any depth, the same way
  # Github::ContentClient#list_directory_recursive always has - but backed by
  # the Git Trees API instead of one Contents API call per directory level.
  #
  # Cost is bounded by the *given path's own* depth, never by how much lives
  # underneath it: one call to find the branch's root tree, one more
  # non-recursive tree call per path segment to resolve down to the target
  # subdirectory's own tree SHA, then a single recursive=1 call from there
  # that returns everything beneath it (any depth) in one response. A
  # directory with dozens of nested subdirectories used to cost one request
  # per level found; now it costs exactly one request, however deep it goes.
  class TreeListing
    def initialize(access_token, repo)
      @api = Github::ApiClient.new(access_token)
      @repo = repo
    end

    # Returns [{"name" => "sword.json", "path" => "items/sword.json", "type" => "file"}, ...] -
    # same shape callers have always gotten back. An empty array means the
    # path doesn't exist (yet) or is empty - not an error; a content type
    # with nothing in it yet is a normal state, not a failure.
    def list(path)
      sha = resolve_sha(path)
      return [] if sha.nil?

      tree = @api.tree(@repo, sha, recursive: true)
      Array(tree["tree"]).select { |entry| entry["type"] == "blob" }.map do |entry|
        full_path = "#{path}/#{entry["path"]}"
        {"name" => full_path.split("/").last, "path" => full_path, "type" => "file"}
      end
    end

    private

    # Walks path's own segments (not what's beneath it) down from the
    # branch's root tree, one non-recursive lookup per segment, to find the
    # target subdirectory's own tree SHA. nil if any segment doesn't exist.
    def resolve_sha(path)
      sha = default_branch
      path.split("/").each do |segment|
        tree = @api.tree(@repo, sha)
        entry = Array(tree["tree"]).find { |e| e["path"] == segment && e["type"] == "tree" }
        return nil if entry.nil?
        sha = entry["sha"]
      end
      sha
    end

    def default_branch
      @default_branch ||= @api.repository(@repo)["default_branch"]
    end
  end
end
