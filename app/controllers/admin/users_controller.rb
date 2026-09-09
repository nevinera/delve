class Admin::UsersController < Admin::BaseController
  def index
    @pagy, @users = pagy(:offset, User.order(:id))
  end
end
