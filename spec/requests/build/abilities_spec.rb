require "rails_helper"

RSpec.describe "Build::Abilities", type: :request do
  let(:user) { create(:user) }

  context "when not logged in" do
    it "redirects index to login" do
      get "/build/abilities"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    describe "GET /build/abilities" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/abilities"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with an expired refresh token" do
        before { create(:github_installation, user: user, refresh_token_expires_at: 1.day.ago) }

        it "redirects to reauth with an alert" do
          get "/build/abilities"
          expect(response).to redirect_to(github_reauth_path)
          expect(flash[:alert]).to include("GitHub authorization has expired")
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "lists the abilities directory contents, linking to the show page" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: [
                {name: "punch.json", path: "abilities/punch.json", type: "file", html_url: "https://github.com/nevinera/delve-content/blob/main/abilities/punch.json"}
              ].to_json
            )

          get "/build/abilities"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include(">punch<")
          expect(response.body).not_to include("punch.json")
          expect(response.body).to include(build_ability_path(id: "punch"))
          expect(response.body).not_to include("github.com/nevinera/delve-content/blob")
        end
      end
    end

    describe "GET /build/abilities/:id" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/abilities/punch"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with an expired refresh token" do
        before { create(:github_installation, user: user, refresh_token_expires_at: 1.day.ago) }

        it "redirects to reauth with an alert" do
          get "/build/abilities/punch"
          expect(response).to redirect_to(github_reauth_path)
          expect(flash[:alert]).to include("GitHub authorization has expired")
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "fetches and displays the ability content as pretty-printed json" do
          content = {"name" => "Punch", "castTime" => nil}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/punch.json")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: {content: Base64.encode64(content.to_json), encoding: "base64"}.to_json
            )

          get "/build/abilities/punch"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include("Punch")
          expect(response.body).to include("castTime")
        end
      end
    end
  end
end
