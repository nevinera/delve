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
    # ahead of time.
    def list_directory_recursive(path)
      entries = contents(path)
      return [] unless entries.is_a?(Array)
      entries.flat_map { |entry| (entry["type"] == "dir") ? list_directory_recursive(entry["path"]) : [entry] }
    end

    def file_content(path)
      data = contents(path)
      raise NotFoundError, "#{path} not found in #{@installation.repo_full_name}" unless data.is_a?(Hash) && data["content"]
      Base64.decode64(data["content"])
    end

    private

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
