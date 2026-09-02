class Build::BaseController < ApplicationController
  check_authorization

  rescue_from Github::NoRepositoryError, with: :redirect_to_github_connect
  rescue_from Github::ReauthRequiredError, with: :redirect_to_github_reauth

  private

  def redirect_to_github_connect
    redirect_to github_connect_path
  end

  def redirect_to_github_reauth
    redirect_to github_reauth_path, alert: "Your GitHub authorization has expired. Please reconnect."
  end
end
