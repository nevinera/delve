class Build::DashboardController < Build::BaseController
  skip_authorization_check only: :index

  def index
    @installation = current_user.github_installation
    redirect_to github_connect_path unless @installation
  end
end
