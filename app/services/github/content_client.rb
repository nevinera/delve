require "base64"

module Github
  class ContentClient
    def initialize(user)
      @installation = user.github_installation
      raise NoRepositoryError, "no GitHub repository connected" if @installation.nil? || @installation.repo_full_name.blank?
    end

    def list_directory(path)
      contents(path)
    end

    # Walks every subdirectory too, returning a flat array of file entries
    # only (directory entries themselves are expanded, not included) - lets
    # content be organized into subdirectories (e.g. abilities/classes/druid/,
    # abilities/units/) without the caller needing to know that structure
    # ahead of time. Backed by Github::TreeListing (Git Trees API) rather
    # than one Contents API call per directory level.
    def list_directory_recursive(path, ref: nil)
      ensure_fresh_token!
      Github::TreeListing.new(@installation.access_token, @installation.repo_full_name).list(path, ref:)
    end

    def file_content(path)
      data = contents(path)
      raise NotFoundError, "#{path} not found in #{@installation.repo_full_name}" unless data.is_a?(Hash) && data["content"]
      Base64.decode64(data["content"])
    end

    def repo = @installation.repo_full_name

    def repository_info
      @repository_info ||= api.repository(repo)
    end

    def public_repo? = repository_info["private"] == false

    def default_branch = repository_info["default_branch"]

    def branch_sha(branch) = api.commit_sha(repo, "heads/#{branch}")

    def tag_sha(tag) = api.commit_sha(repo, "tags/#{tag}")

    # Tag names (without "refs/tags/") starting with prefix.
    def branch_names
      api.matching_refs(repo, "heads/").map { |ref| ref.delete_prefix("refs/heads/") }
    end

    def tag_names(prefix)
      api.matching_refs(repo, "tags/#{prefix}").map { |ref| ref.delete_prefix("refs/tags/") }
    end

    def create_tag(tag, sha) = api.create_tag_ref(repo, tag, sha)

    private

    def api
      ensure_fresh_token!
      Github::ApiClient.new(@installation.access_token)
    end

    def contents(path)
      ensure_fresh_token!
      Github::ApiClient.new(@installation.access_token).repository_contents(@installation.repo_full_name, path)
    end

    def ensure_fresh_token!
      raise ReauthRequiredError, "GitHub authorization has expired" if @installation.refresh_token_expired?
      return unless @installation.access_token_expired?

      tokens = Github::OauthClient.refresh(@installation.refresh_token)
      @installation.update_tokens!(
        access_token: tokens["access_token"],
        refresh_token: tokens["refresh_token"],
        expires_in: tokens["expires_in"],
        refresh_token_expires_in: tokens["refresh_token_expires_in"]
      )
    end
  end
end
