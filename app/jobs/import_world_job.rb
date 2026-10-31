# Imports one published version of a world (WorldImport): finds the commit its tag points at, once,
# downloads that commit as a zip by sha, and records its files.
class ImportWorldJob < ApplicationJob
  queue_as :default

  def perform(import)
    import.update!(status: "running", started_at: Time.current, error: nil)
    world = import.world
    github = world.user.github_connection
    raise Github::OauthError, "#{world.user.email} hasn't connected GitHub" if github.nil?
    api = github.api

    repo = api.repo(world.repo) or raise Github::OauthError, "GitHub has no #{world.repo}, or the app can't see it"
    sha = api.tag_sha(world.repo, import.tag) or raise Github::OauthError, "#{world.repo} has no tag #{import.tag}"
    import.update!(sha:, private_repo: repo["private"])

    Tempfile.create(["world", ".zip"], binmode: true) do |zip|
      api.download_zip(world.repo, sha, zip)
      zip.flush
      files = Worlds::Manifest.call(zip.path)
      import.update!(
        status: "passed",
        problems: [],
        files:,
        file_count: files.size,
        bytes: files.sum { |_, f| f["size"] },
        finished_at: Time.current
      )
    end
  rescue => e
    # Recorded rather than retried: importing again is the owner's call.
    import.update!(status: "error", error: e.message, finished_at: Time.current)
    Rails.error.report(e, handled: true) unless e.is_a?(Github::OauthError) || e.is_a?(Worlds::Manifest::Failed)
  end
end
