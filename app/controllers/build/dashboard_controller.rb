class Build::DashboardController < Build::BaseController
  skip_authorization_check only: :index

  def index
  end
end
