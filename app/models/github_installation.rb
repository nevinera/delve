class GithubInstallation < ApplicationRecord
  belongs_to :user

  encrypts :access_token, :refresh_token

  validates :installation_id, presence: true, uniqueness: true
  validates :repo_full_name, presence: true
  validates :access_token, :refresh_token, presence: true
  validates :access_token_expires_at, :refresh_token_expires_at, presence: true
  validates :user_id, uniqueness: true
  validates :library_repo, allow_nil: true,
    format: {with: /\A[\w.-]+\/[\w.-]+\z/, message: "must be username/reponame"}

  normalizes :library_repo, with: ->(repo) { repo.strip.delete_suffix(".git").presence }

  # The repo shared content is imported from: library_repo, else the
  # connected repo.
  def library_repo_name = library_repo || repo_full_name

  def access_token_expired?
    access_token_expires_at <= Time.current
  end

  def refresh_token_expired?
    refresh_token_expires_at <= Time.current
  end

  def update_tokens!(access_token:, refresh_token:, expires_in:, refresh_token_expires_in:)
    update!(
      access_token: access_token,
      refresh_token: refresh_token,
      access_token_expires_at: Time.current + expires_in.seconds,
      refresh_token_expires_at: Time.current + refresh_token_expires_in.seconds
    )
  end
end
