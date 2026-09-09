class Admin::UsersController < ApplicationController
  def index
    @pagy, @users = pagy(:offset, User.order(:id))
  end
end
