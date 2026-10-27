# Signs in as any user, or a new one by email, without Google. Its routes exist only in
# development and test.
class DevSessionsController < ApplicationController
  skip_before_action :authenticate_user!

  def create
    user = params[:user_id].present? ? User.find(params[:user_id]) : find_or_create_by_email
    sign_in user
    redirect_to after_sign_in_path_for(user)
  end

  private

  def find_or_create_by_email
    email = params.require(:email).strip
    User.find_by(email: email) || User.create!(provider: "developer", uid: email, email: email, name: email.split("@").first)
  end
end
