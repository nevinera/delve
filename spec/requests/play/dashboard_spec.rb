require "rails_helper"

RSpec.describe "Play::Dashboard", type: :request do
  let(:user) { create(:user) }

  context "when not logged in" do
    it "redirects index to login" do
      get "/play"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    it "returns 200 and links to the characters listing" do
      get "/play"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include(play_characters_path)
    end
  end
end
