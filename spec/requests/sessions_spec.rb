require "rails_helper"

RSpec.describe "Sessions", type: :request do
  it "sends signed-out visitors to the login page" do
    get create_path
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

    get create_path
    expect(response).to redirect_to("/login")
  end

  describe "development sign-in" do
    it "lists users to sign in as" do
      create(:user, email: "alice@example.com")
      get "/login"
      expect(response.body).to include("Sign in as alice@example.com")
    end

    it "signs in as a chosen user" do
      user = create(:user)
      post "/dev_session", params: {user_id: user.id}
      get create_path
      expect(response).to have_http_status(:ok)
    end

    it "makes a new user from an email" do
      expect { post "/dev_session", params: {email: "new@example.com"} }.to change(User, :count).by(1)
      expect(User.last).to have_attributes(provider: "developer", uid: "new@example.com")
      get create_path
      expect(response).to have_http_status(:ok)
    end

    it "signs in as an existing user with that email" do
      create(:user, email: "old@example.com")
      expect { post "/dev_session", params: {email: "old@example.com"} }.not_to change(User, :count)
    end
  end
end
