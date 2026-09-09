class Play::DashboardController < Play::BaseController
  skip_authorization_check only: :index

  def index
  end
end
