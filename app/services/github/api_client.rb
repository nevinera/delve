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

    # The repo's tags, as { name => commit sha }. An annotated tag is followed to its commit.
    def tags(full_name)
      get("/repos/#{full_name}/git/matching-refs/tags/").to_h do |ref|
        object = ref["object"]
        object = get("/repos/#{full_name}/git/tags/#{object["sha"]}")["object"] if object["type"] == "tag"
        [ref["ref"].delete_prefix("refs/tags/"), object["sha"]]
      end
    end

    # The commit a tag points at, or nil when there's no such tag.
    def tag_sha(full_name, tag)
      object = get("/repos/#{full_name}/git/ref/tags/#{ERB::Util.url_encode(tag)}")["object"]
      object = get("/repos/#{full_name}/git/tags/#{object["sha"]}")["object"] if object["type"] == "tag"
      object["sha"]
    rescue NotFound
      nil
    end

    # The commit a branch points at, or nil when there's no such branch.
    def branch_sha(full_name, branch)
      get("/repos/#{full_name}/git/ref/heads/#{ERB::Util.url_encode(branch)}")["object"]["sha"]
    rescue NotFound
      nil
    end

    # Every entry in a commit's tree, all the way down, as GitHub lists them.
    def tree(full_name, commit_sha)
      tree_sha = get("/repos/#{full_name}/git/commits/#{commit_sha}")["tree"]["sha"]
      tree = get("/repos/#{full_name}/git/trees/#{tree_sha}?recursive=1")
      raise OauthError, "#{full_name} has too many files to list in one request" if tree["truncated"]
      tree["tree"]
    end

    # Commits a tree made of `entries` on `parent_sha` and moves the branch to it. GitHub refuses
    # to move the branch if it has moved past `parent_sha`. Returns the new commit's sha.
    def commit(full_name, branch, entries, message:, parent_sha:)
      tree_sha = send_json(:post, "/repos/#{full_name}/git/trees", {tree: entries})["sha"]
      commit_sha = send_json(:post, "/repos/#{full_name}/git/commits", {message:, tree: tree_sha, parents: [parent_sha]})["sha"]
      send_json(:patch, "/repos/#{full_name}/git/refs/heads/#{ERB::Util.url_encode(branch)}", {sha: commit_sha})
      commit_sha
    end

    # Writes the repo at a commit, zipped, to `io`. GitHub answers with a redirect to a
    # short-lived download link, which needs no token.
    def download_zip(full_name, sha, io)
      uri = URI("#{BASE_URL}/repos/#{full_name}/zipball/#{sha}")
      response = request(uri)
      raise NotFound, "GitHub has no #{full_name} at #{sha}" if response.is_a?(Net::HTTPNotFound)
      raise OauthError, "GitHub API error #{response.code} for the zip of #{full_name}" unless response.is_a?(Net::HTTPRedirection)
      link = URI(response["location"])
      Net::HTTP.start(link.host, link.port, use_ssl: link.scheme == "https") do |http|
        http.request(Net::HTTP::Get.new(link)) do |download|
          raise OauthError, "GitHub's zip download failed (#{download.code})" unless download.is_a?(Net::HTTPSuccess)
          download.read_body { |chunk| io.write(chunk) }
        end
      end
    end

    private

    def request(uri, method: Net::HTTP::Get, body: nil)
      request = method.new(uri)
      request["Authorization"] = "Bearer #{@access_token}"
      request["Accept"] = "application/vnd.github+json"
      request["X-GitHub-Api-Version"] = "2022-11-28"
      if body
        request["Content-Type"] = "application/json"
        request.body = body.to_json
      end
      Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(request) }
    end

    def paged(path)
      (1..).each_with_object([]) do |page, all|
        batch = yield get("#{path}?per_page=#{PER_PAGE}&page=#{page}")
        all.concat(batch)
        break all if batch.size < PER_PAGE
      end
    end

    def get(path)
      response = request(URI("#{BASE_URL}#{path}"))
      raise NotFound, "GitHub has no #{path}" if response.is_a?(Net::HTTPNotFound)
      raise OauthError, "GitHub API error #{response.code} for #{path}" unless response.is_a?(Net::HTTPSuccess)
      JSON.parse(response.body)
    end

    def send_json(verb, path, body)
      method = {post: Net::HTTP::Post, patch: Net::HTTP::Patch}.fetch(verb)
      response = request(URI("#{BASE_URL}#{path}"), method:, body:)
      raise OauthError, "GitHub API error #{response.code} for #{verb.upcase} #{path}" unless response.is_a?(Net::HTTPSuccess)
      JSON.parse(response.body)
    end
  end
end
