module Github
  class ApiClient
    BASE_URL = "https://api.github.com"
    PER_PAGE = 100

    class NotFound < OauthError; end

    def initialize(access_token)
      @access_token = access_token
    end

    def user = get("/user")

    # A repo, or nil when it doesn't exist or the app can't see it.
    def repo(full_name)
      get("/repos/#{full_name}")
    rescue NotFound
      nil
    end

    # Every repo the user has granted the app, across all its installations.
    def repos
      get("/user/installations")["installations"].flat_map do |installation|
        paged("/user/installations/#{installation["id"]}/repositories") { |page| page["repositories"] }
      end
    end

    private

    def paged(path)
      (1..).each_with_object([]) do |page, all|
        batch = yield get("#{path}?per_page=#{PER_PAGE}&page=#{page}")
        all.concat(batch)
        break all if batch.size < PER_PAGE
      end
    end

    def get(path)
      uri = URI("#{BASE_URL}#{path}")
      request = Net::HTTP::Get.new(uri)
      request["Authorization"] = "Bearer #{@access_token}"
      request["Accept"] = "application/vnd.github+json"
      request["X-GitHub-Api-Version"] = "2022-11-28"
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(request) }
      raise NotFound, "GitHub has no #{path}" if response.is_a?(Net::HTTPNotFound)
      raise OauthError, "GitHub API error #{response.code} for #{path}" unless response.is_a?(Net::HTTPSuccess)
      JSON.parse(response.body)
    end
  end
end
