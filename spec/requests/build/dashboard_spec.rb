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
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a github installation but no repo selected" do
        before do
          installation = create(:github_installation, user: user)
          installation.update_column(:repo_full_name, "")
        end

        it "returns 200 and prompts for a repository" do
          get "/build"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include("don't have a repository selected")
        end
      end

      context "with a fully connected github installation" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "returns 200 and links to the connected repository" do
          get "/build"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include("nevinera/delve-content")
          expect(response.body).to include("https://github.com/nevinera/delve-content")
        end

        it "links to the manage GitHub connection page" do
          get "/build"
          expect(response.body).to include(github_manage_path)
        end

        it "links to the abilities listing" do
          get "/build"
          expect(response.body).to include(build_abilities_path)
        end

        it "links to the zones listing" do
          get "/build"
          expect(response.body).to include(build_registration_zones_path)
        end

        it "links to the classes listing" do
          get "/build"
          expect(response.body).to include(build_classes_path)
        end
      end
    end
  end
end
