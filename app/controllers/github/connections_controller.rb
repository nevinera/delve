class Github::ConnectionsController < ApplicationController
  TEMPLATE_OWNER = "nevinera"
  TEMPLATE_REPO = "delve-content-template"

  def connect
    @installation = current_user.github_installation
    session[:github_oauth_state] = SecureRandom.hex(24)
    @template_url = "https://github.com/new?template_owner=#{TEMPLATE_OWNER}&template_name=#{TEMPLATE_REPO}&name=delve-content"
    @install_url = "#{ENV.string("DELVE_GITHUB_PUBLIC_LINK", default: nil)}/installations/new?state=#{session[:github_oauth_state]}"
  end

  def reauth
    session[:github_oauth_state] = SecureRandom.hex(24)
    redirect_to authorize_url, allow_other_host: true
  end

  def callback
    return invalid_state_redirect unless state_valid?

    installation = connect_installation
    return redirect_to github_connect_path, alert: installation if installation.is_a?(String)

    redirect_to build_root_path, notice: "GitHub connected: #{installation.repo_full_name}"
  rescue Github::OauthError => e
    redirect_to github_connect_path, alert: "GitHub authorization failed: #{e.message}"
  end

  def token
    installation = current_user.github_installation
    return render_not_connected if installation.nil?
    return render_reauth_required if installation.refresh_token_expired?

    apply_tokens!(installation, Github::OauthClient.refresh(installation.refresh_token)) if installation.access_token_expired?
    render json: token_payload(installation)
  end

  private

  def authorize_url
    "https://github.com/login/oauth/authorize" \
      "?client_id=#{ENV.string("DELVE_GITHUB_CLIENT_ID", default: nil)}" \
      "&redirect_uri=#{CGI.escape(github_callback_url)}" \
      "&state=#{session[:github_oauth_state]}"
  end

  def state_valid?
    expected_state = session.delete(:github_oauth_state)
    params[:state].present? && params[:state] == expected_state
  end

  def invalid_state_redirect
    redirect_to github_connect_path, alert: "GitHub authorization failed: invalid state."
  end

  def connect_installation
    tokens = Github::OauthClient.exchange_code(params[:code])
    installation = params[:installation_id].present? ? new_installation(tokens) : existing_installation
    return installation if installation.is_a?(String)

    apply_tokens!(installation, tokens)
    installation
  end

  def new_installation(tokens)
    repo = fetch_repo(tokens)
    return "No repository selected during installation." if repo.nil?

    assign_new_installation(repo)
  end

  def fetch_repo(tokens)
    Github::ApiClient.new(tokens["access_token"]).installation_repositories(params[:installation_id])&.first
  end

  def assign_new_installation(repo)
    installation = current_user.github_installation || current_user.build_github_installation
    installation.installation_id = params[:installation_id]
    installation.repo_full_name = repo["full_name"]
    installation
  end

  def existing_installation
    current_user.github_installation || "No existing GitHub connection to reauthorize."
  end

  def apply_tokens!(installation, tokens)
    installation.update_tokens!(
      access_token: tokens["access_token"],
      refresh_token: tokens["refresh_token"],
      expires_in: tokens["expires_in"],
      refresh_token_expires_in: tokens["refresh_token_expires_in"]
    )
  end

  def render_not_connected
    render json: {error: "not_connected", connect_url: github_connect_path}, status: :unauthorized
  end

  def render_reauth_required
    render json: {error: "reauth_required", reauth_url: github_reauth_path}, status: :unauthorized
  end

  def token_payload(installation)
    {
      token: installation.access_token,
      expires_at: installation.access_token_expires_at.iso8601,
      repo_full_name: installation.repo_full_name
    }
  end
end
