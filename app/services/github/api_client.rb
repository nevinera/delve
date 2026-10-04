module Github
  class ApiClient
    BASE_URL = "https://api.github.com"

    def initialize(access_token)
      @access_token = access_token
    end

    def installation_repositories(installation_id)
      get("/user/installations/#{installation_id}/repositories")["repositories"]
    end

    def user
      get("/user")
    end

    def installations
      get("/user/installations")["installations"]
    end

    def repository_contents(repo, path)
      get("/repos/#{repo}/contents/#{path}")
    end

    def repository(repo)
      get("/repos/#{repo}")
    end

    # tree_sha may be a real tree SHA, or (only meaningfully for a first
    # call) a branch/tag name - GitHub resolves either. recursive: true
    # walks every level beneath it in this one call, instead of one call per
    # level (see Github::TreeListing, the only caller).
    def tree(repo, tree_sha, recursive: false)
      path = "/repos/#{repo}/git/trees/#{tree_sha}"
      path += "?recursive=1" if recursive
      get(path)
    end

    # The commit SHA a branch or tag points at. qualified_ref is
    # "heads/<branch>" or "tags/<tag>". An annotated tag's ref points at a
    # tag object rather than a commit, so that's dereferenced too.
    def commit_sha(repo, qualified_ref)
      object = get!("/repos/#{repo}/git/ref/#{qualified_ref}")["object"]
      object = get!("/repos/#{repo}/git/tags/#{object["sha"]}")["object"] while object["type"] == "tag"
      object["sha"]
    end

    # Every ref name under a prefix, e.g. ("tags/demo-core/v") ->
    # ["refs/tags/demo-core/v1", ...]. Empty when nothing matches.
    def matching_refs(repo, qualified_prefix)
      get!("/repos/#{repo}/git/matching-refs/#{qualified_prefix}").map { |ref| ref["ref"] }
    end

    # A lightweight tag - it only exists for human reference, since world
    # versions read their content by commit SHA.
    def create_tag_ref(repo, tag, sha)
      post!("/repos/#{repo}/git/refs", {ref: "refs/tags/#{tag}", sha:})
    end

    private

    def get(path)
      JSON.parse(request(path, accept: "application/vnd.github+json").body)
    end

    # Unlike #get, raises on a non-2xx response instead of handing back
    # GitHub's error body.
    def get!(path)
      parse!(request(path, accept: "application/vnd.github+json"), path)
    end

    def post!(path, body)
      parse!(request(path, accept: "application/vnd.github+json", method: :post, body:), path)
    end

    def parse!(response, path)
      case response
      when Net::HTTPSuccess then JSON.parse(response.body)
      when Net::HTTPNotFound then raise NotFoundError, "#{path} not found"
      else raise ApiError, "GitHub API error #{response.code} for #{path}: #{error_message(response)}"
      end
    end

    def error_message(response)
      JSON.parse(response.body)["message"]
    rescue JSON::ParserError
      response.message
    end

    def request(path, accept:, method: :get, body: nil)
      uri = URI("#{BASE_URL}#{path}")
      req = build_request(uri, method:, accept:, body:)
      Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(req) }
    end

    def build_request(uri, method:, accept:, body:)
      req = (method == :post) ? Net::HTTP::Post.new(uri) : Net::HTTP::Get.new(uri)
      req["Authorization"] = "Bearer #{@access_token}"
      req["Accept"] = accept
      req["X-GitHub-Api-Version"] = "2022-11-28"
      if body
        req["Content-Type"] = "application/json"
        req.body = body.to_json
      end
      req
    end
  end
end
