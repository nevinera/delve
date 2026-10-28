# A user's GitHub authorization through the GitHub App. It reaches every repo the user has
# granted the app, so it isn't tied to one repo.
class GithubConnection < ApplicationRecord
  belongs_to :user

  encrypts :access_token, :refresh_token

  validates :login, :access_token, :refresh_token, presence: true
  validates :access_token_expires_at, :refresh_token_expires_at, presence: true
  validates :user_id, uniqueness: true

  def access_token_expired? = access_token_expires_at <= Time.current

  def refresh_token_expired? = refresh_token_expires_at <= Time.current

  def update_tokens!(tokens)
    update!(
      access_token: tokens["access_token"],
      refresh_token: tokens["refresh_token"],
      access_token_expires_at: Time.current + tokens["expires_in"].to_i.seconds,
      refresh_token_expires_at: Time.current + tokens["refresh_token_expires_in"].to_i.seconds
    )
  end
end
