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

    def repository_contents(repo, path)
      get("/repos/#{repo}/contents/#{path}")
    end

    private

    def get(path)
      uri = URI("#{BASE_URL}#{path}")
      request = Net::HTTP::Get.new(uri)
      request["Authorization"] = "Bearer #{@access_token}"
      request["Accept"] = "application/vnd.github+json"
      request["X-GitHub-Api-Version"] = "2022-11-28"

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(request) }
      JSON.parse(response.body)
    end
  end
end
