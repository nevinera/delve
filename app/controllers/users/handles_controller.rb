class Users::HandlesController < ApplicationController
  before_action :set_user

  def index
    @handles = @user.handles.order(:identifier)
  end

  def show
    @handle = @user.handles.find(params[:id])
  end

  def create
    @handle = @user.handles.new(handle_params)
    if @handle.save
      redirect_to user_handle_path(@user, @handle), notice: "Handle created."
    else
      render :new, status: :unprocessable_entity
    end
  end

  def new
    @handle = @user.handles.new
  end

  private

  def set_user
    @user = User.find(params[:user_id])
  end

  def handle_params
    params.require(:handle).permit(:identifier, :description)
  end
end
