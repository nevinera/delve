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

    # Unlike #repository_contents (Accept: application/vnd.github+json), which
    # only inlines base64 content for files <=1MB and otherwise silently
    # returns an empty content field instead of an error - indistinguishable
    # from a genuinely empty file - the raw media type returns the exact
    # bytes directly, with no size-tiered response shape, up to 100MB. Use
    # this for binary assets (a map's background image, say) that can
    # plausibly exceed 1MB; returns the full Net::HTTPResponse so the caller
    # can check the status itself rather than assume a JSON error body.
    def raw_repository_contents(repo, path)
      get_raw("/repos/#{repo}/contents/#{path}")
    end

    private

    def get(path)
      JSON.parse(request(path, accept: "application/vnd.github+json").body)
    end

    def get_raw(path)
      request(path, accept: "application/vnd.github.raw+json")
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
