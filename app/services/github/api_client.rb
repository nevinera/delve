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

    private

    def get(path)
      JSON.parse(request(path, accept: "application/vnd.github+json").body)
    end

    def request(path, accept:)
      uri = URI("#{BASE_URL}#{path}")
      req = Net::HTTP::Get.new(uri)
      req["Authorization"] = "Bearer #{@access_token}"
      req["Accept"] = accept
      req["X-GitHub-Api-Version"] = "2022-11-28"

      Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(req) }
    end
  end
end
