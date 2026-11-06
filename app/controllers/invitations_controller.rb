# An invitation's link: it keeps the invitation for this browser, then you sign in with Google to
# make your account with it (Users::OmniauthCallbacksController).
class InvitationsController < ApplicationController
  skip_before_action :authenticate_user!

  def show
    return redirect_to home_path, notice: "You already have an account." if user_signed_in?
    @invitation = Invitation.find_by(token: params[:token])
    return render :gone, status: :not_found if @invitation.nil? || @invitation.used?
    session[:invitation_token] = @invitation.token
  end
end
