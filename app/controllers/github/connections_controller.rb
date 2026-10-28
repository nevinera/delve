# Connects a user's account to GitHub through the GitHub App, once per account. Installing the
# app (or changing which repos it can see) and authorizing both come back to #callback.
class Github::ConnectionsController < ApplicationController
  def show
    @connection = current_user.github_connection
    @install_url = install_url
    @authorize_url = authorize_url
  end

  def reauth
    redirect_to authorize_url, allow_other_host: true
  end

  def callback
    return redirect_to github_connect_path, alert: "GitHub authorization failed: invalid state." unless state_valid?

    tokens = Github::OauthClient.exchange_code(params[:code])
    login = Github::ApiClient.new(tokens["access_token"]).user["login"]
    return redirect_to github_connect_path, alert: "This GitHub account is not permitted." unless AllowOnlyList.allows?("github", login)

    connection = current_user.github_connection || current_user.build_github_connection
    connection.login = login
    connection.update_tokens!(tokens)
    redirect_to github_connect_path, notice: "GitHub connected as #{login}."
  rescue Github::OauthError => e
    redirect_to github_connect_path, alert: "GitHub authorization failed: #{e.message}"
  end

  # The browser's short-lived token for reading and writing repos, refreshed when it has expired.
  def token
    connection = current_user.github_connection
    return render json: {error: "not_connected", connect_url: github_connect_path}, status: :unauthorized if connection.nil?
    return render json: {error: "reauth_required", reauth_url: github_reauth_path}, status: :unauthorized if connection.refresh_token_expired?

    connection.update_tokens!(Github::OauthClient.refresh(connection.refresh_token)) if connection.access_token_expired?
    render json: {token: connection.access_token, expires_at: connection.access_token_expires_at.iso8601, login: connection.login}
  end

  def disconnect
    connection = current_user.github_connection
    if connection
      revoke_grant(connection.access_token)
      connection.destroy
    end
    redirect_to github_connect_path, notice: "Disconnected from GitHub."
  end

  private

  def new_state = session[:github_oauth_state] = SecureRandom.hex(24)

  def install_url
    "#{ENV.string("DELVE_GITHUB_PUBLIC_LINK", default: nil)}/installations/new?state=#{new_state}"
  end

  def authorize_url
    "https://github.com/login/oauth/authorize" \
      "?client_id=#{ENV.string("DELVE_GITHUB_CLIENT_ID", default: nil)}" \
      "&redirect_uri=#{CGI.escape(github_callback_url)}" \
      "&state=#{session[:github_oauth_state] || new_state}"
  end

  def state_valid?
    expected = session.delete(:github_oauth_state)
    params[:state].present? && params[:state] == expected
  end

  def revoke_grant(access_token)
    Github::OauthClient.revoke(access_token)
  rescue => e
    Rails.logger.warn("GitHub grant revocation failed: #{e.message}")
  end
end
