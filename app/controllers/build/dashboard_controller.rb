class Build::DashboardController < Build::BaseController
  skip_authorization_check only: :index

  def index
    @installation = current_user.github_installation
    @local_content = Rails.configuration.x.local_content_url.present?
    redirect_to github_connect_path unless @installation || @local_content
  end
end
