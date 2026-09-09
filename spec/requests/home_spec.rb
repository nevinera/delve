require "rails_helper"

RSpec.describe "Home", type: :request do
  let(:user) { create(:user) }

  context "when not logged in" do
    it "redirects to login" do
      get "/home"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    it "returns 200 and links to Play and Build" do
      get "/home"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include("/play")
      expect(response.body).to include("/build")
    end
  end
end
