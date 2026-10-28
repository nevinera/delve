# The front page, for visitors. Once you're signed in it sends you to /home.
class HomeController < ApplicationController
  skip_before_action :authenticate_user!

  def show
    redirect_to home_path if user_signed_in?
  end
end
