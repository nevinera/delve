require 'rails_helper'

RSpec.describe "OmniAuth Google OAuth2 callback", type: :request do
  describe "GET /users/auth/google_oauth2/callback" do
    context "with a valid auth response for a new user" do
      let(:auth) { google_auth_hash(uid: "new_uid", email: "new@example.com", name: "New User") }

      it "creates a user" do
        expect {
          get "/users/auth/google_oauth2/callback", env: { "omniauth.auth" => auth }
        }.to change(User, :count).by(1)
      end

      it "redirects after sign-in" do
        get "/users/auth/google_oauth2/callback", env: { "omniauth.auth" => auth }
        expect(response).to be_redirect
      end
    end

    context "with a valid auth response for an existing user" do
      let!(:user) { create(:user, provider: "google_oauth2", uid: "existing_uid") }
      let(:auth) { google_auth_hash(uid: "existing_uid") }

      it "does not create a new user" do
        expect {
          get "/users/auth/google_oauth2/callback", env: { "omniauth.auth" => auth }
        }.not_to change(User, :count)
      end

      it "redirects after sign-in" do
        get "/users/auth/google_oauth2/callback", env: { "omniauth.auth" => auth }
        expect(response).to be_redirect
      end
    end
  end

end
