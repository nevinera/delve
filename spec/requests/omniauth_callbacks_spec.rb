require "rails_helper"

RSpec.describe "OmniAuth Google OAuth2 callback", type: :request do
  let(:callback) { "/users/auth/google_oauth2/callback" }

  context "when the user already exists" do
    before do
      create(:user, provider: "google_oauth2", uid: "existing_uid")
      set_google_auth(uid: "existing_uid")
    end

    it "signs them in without an invitation, and creates no user" do
      expect { get callback }.not_to change(User, :count)
      expect(response).to redirect_to(root_path)
      expect(flash[:alert]).to be_nil
    end
  end

  context "when the user doesn't exist yet" do
    before { set_google_auth(uid: "new_uid", email: "new@example.com", name: "New User") }

    it "won't make an account without an invitation" do
      expect { get callback }.not_to change(User, :count)
      expect(response).to redirect_to(root_path)
      expect(flash[:alert]).to match(/need an invitation/)
    end

    it "makes an account with an invitation opened in this browser, and uses it up" do
      invitation = Invitation.create!
      get invitation_path(invitation.token)

      expect { get callback }.to change(User, :count).by(1)
      expect(response).to redirect_to(root_path)
      user = User.last
      expect([user.email, user.name, invitation.reload.used_by]).to eq(["new@example.com", "New User", user])
    end

    it "won't make an account with an invitation someone else used meanwhile" do
      invitation = Invitation.create!
      get invitation_path(invitation.token)
      invitation.use!(create(:user))

      expect { get callback }.not_to change(User, :count)
      expect(flash[:alert]).to match(/need an invitation/)
    end
  end

  context "when Google sign-in fails" do
    before do
      set_google_auth
      OmniAuth.config.mock_auth[:google_oauth2] = :invalid_credentials
    end

    it "redirects with the failure reason" do
      get callback
      follow_redirect! if response.location&.include?("/users/auth/failure")
      expect(response).to redirect_to(root_path)
      expect(flash[:alert]).to start_with("Authentication failed:")
    end
  end
end
