class GithubInstallation < ApplicationRecord
  belongs_to :user

  encrypts :access_token, :refresh_token

  validates :installation_id, presence: true, uniqueness: true
  validates :repo_full_name, presence: true
  validates :access_token, :refresh_token, presence: true
  validates :access_token_expires_at, :refresh_token_expires_at, presence: true
  validates :user_id, uniqueness: true

  def access_token_expired?
    access_token_expires_at <= Time.current
  end

  def refresh_token_expired?
    refresh_token_expires_at <= Time.current
  end
end
