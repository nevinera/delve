require "rails_helper"

RSpec.describe "Sessions", type: :request do
  it "sends signed-out visitors to the login page" do
    get editor_path
    expect(response).to redirect_to("/login")
  end

  it "shows the login page" do
    get "/login"
    expect(response).to have_http_status(:ok)
    expect(response.body).to include("Sign in with Google")
  end

  it "signs the user out and sends them to the login page" do
    sign_in create(:user)
    delete "/logout"
    expect(response).to redirect_to("/login")

    get editor_path
    expect(response).to redirect_to("/login")
  end
end
