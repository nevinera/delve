class Users::OmniauthCallbacksController < Devise::OmniauthCallbacksController
  def google_oauth2
    auth = request.env["omniauth.auth"]

    unless AllowOnlyList.allows?("google", auth.info.email)
      return redirect_to root_path, alert: "Sign in failed - this account is not permitted."
    end

    user = User.from_omniauth(auth)

    if user.persisted?
      sign_in_and_redirect user, event: :authentication
    else
      redirect_to root_path, alert: "Sign in failed - could not create account."
    end
  end

  def failure
    redirect_to root_path, alert: "Authentication failed: #{failure_message}"
  end
end
