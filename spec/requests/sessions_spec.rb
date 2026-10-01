require "rails_helper"

RSpec.describe "Sessions", type: :request do
  let(:user) { create(:user) }

  describe "DELETE /logout" do
    it "signs the user out and sends them to the login page" do
      sign_in user
      delete "/logout"
      expect(response).to redirect_to("/login")

      get "/play"
      expect(response).to redirect_to("/login")
    end
  end
end
