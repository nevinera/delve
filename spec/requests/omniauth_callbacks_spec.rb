require "rails_helper"

RSpec.describe "OmniAuth Google OAuth2 callback", type: :request do
  describe "signing in via Google" do
    context "when the user does not exist yet" do
      before { set_google_auth(uid: "new_uid", email: "new@example.com", name: "New User") }

      it "creates a user" do
        expect { get "/users/auth/google_oauth2/callback" }.to change(User, :count).by(1)
      end

      it "redirects after sign-in" do
        get "/users/auth/google_oauth2/callback"
        expect(response).to be_redirect
      end
    end

    context "when the user already exists" do
      let!(:user) { create(:user, provider: "google_oauth2", uid: "existing_uid") }

      before { set_google_auth(uid: "existing_uid") }

      it "does not create a new user" do
        expect { get "/users/auth/google_oauth2/callback" }.not_to change(User, :count)
      end

      it "redirects after sign-in" do
        get "/users/auth/google_oauth2/callback"
        expect(response).to be_redirect
      end
    end
  end
end
