require "rails_helper"

RSpec.describe "OmniAuth Google OAuth2 callback", type: :request do
  context "when the user does not exist yet" do
    before { set_google_auth(uid: "new_uid", email: "new@example.com", name: "New User") }

    it "creates a user and signs them in" do
      expect { get "/users/auth/google_oauth2/callback" }.to change(User, :count).by(1)
      expect(response).to redirect_to(root_path)
      expect(User.last).to have_attributes(email: "new@example.com", name: "New User")
    end
  end

  context "when the user already exists" do
    before do
      create(:user, provider: "google_oauth2", uid: "existing_uid")
      set_google_auth(uid: "existing_uid")
    end

    it "signs them in without creating a user" do
      expect { get "/users/auth/google_oauth2/callback" }.not_to change(User, :count)
      expect(response).to redirect_to(root_path)
    end
  end

  context "when the account can't be created" do
    before do
      set_google_auth(uid: "new_uid", email: "new@example.com")
      allow(User).to receive(:from_omniauth).and_return(User.new)
    end

    it "redirects with an alert instead of signing in" do
      get "/users/auth/google_oauth2/callback"
      expect(response).to redirect_to(root_path)
      expect(flash[:alert]).to eq("Sign in failed - could not create account.")
    end
  end

  context "when Google sign-in fails" do
    before do
      set_google_auth
      OmniAuth.config.mock_auth[:google_oauth2] = :invalid_credentials
    end

    it "redirects with the failure reason" do
      get "/users/auth/google_oauth2/callback"
      follow_redirect! if response.location&.include?("/users/auth/failure")
      expect(response).to redirect_to(root_path)
      expect(flash[:alert]).to start_with("Authentication failed:")
    end
  end
end
