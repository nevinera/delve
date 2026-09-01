require "rails_helper"

RSpec.describe "Build::Dashboard", type: :request do
  let(:user) { create(:user) }

  context "when not logged in" do
    it "redirects index to login" do
      get "/build"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    describe "GET /build" do
      it "returns 200" do
        get "/build"
        expect(response).to have_http_status(:ok)
      end

      it "links to the handles, zones, and character classes listings" do
        get "/build"
        expect(response.body).to include(build_handles_path)
        expect(response.body).to include(build_zones_path)
        expect(response.body).to include(build_character_classes_path)
      end
    end
  end
end
