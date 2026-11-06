class Users::OmniauthCallbacksController < Devise::OmniauthCallbacksController
  def google_oauth2
    result = Invitations::SignIn.call(request.env["omniauth.auth"], invitation_token: session.delete(:invitation_token))
    return redirect_to root_path, alert: result.error if result.error

    sign_in_and_redirect result.user, event: :authentication
  end

  def failure
    redirect_to root_path, alert: "Authentication failed: #{failure_message}"
  end
end
