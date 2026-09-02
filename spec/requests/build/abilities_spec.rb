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

        it "fetches and renders the ability as field tables with collapsible effect sections" do
          content = {
            "name" => "Punch",
            "castTime" => nil,
            "globalCooldown" => 0.5,
            "graphicEffects" => [
              {"sourceURL" => "../graphics/effects/punch-impact.webp", "duration" => 0.3, "when" => "impact"}
            ],
            "soundEffects" => [
              {"sourceURL" => "../audio/punch.ogg", "duration" => 0.12, "location" => "affected"}
            ],
            "effects" => [
              {"type" => "harm", "affects" => "bTarget", "amount" => [89.0, 140.0], "tags" => ["physical", "melee"]}
            ]
          }
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/punch.json")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: {content: Base64.encode64(content.to_json), encoding: "base64"}.to_json
            )
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/graphics/effects/punch-impact.webp")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: {content: Base64.encode64("fake-webp-bytes"), encoding: "base64"}.to_json
            )
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/audio/punch.ogg")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: {content: Base64.encode64("fake-ogg-bytes"), encoding: "base64"}.to_json
            )

          get "/build/abilities/punch"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include("Punch")
          expect(response.body).to include("Global cooldown")
          expect(response.body).to include("<details")
          expect(response.body).to include("Graphic effects (1)")
          expect(response.body).to include("Sound effects (1)")
          expect(response.body).to include("Effects (1)")
          expect(response.body).to include("1. harm")
          expect(response.body).to include("physical, melee")
          expect(response.body).not_to include("{&quot;")
          expect(response.body).to include(%(<img src="data:image/webp;base64,#{Base64.strict_encode64("fake-webp-bytes")}"))
          expect(response.body).to include(%(<audio controls src="data:audio/ogg;base64,#{Base64.strict_encode64("fake-ogg-bytes")}"))
        end

        it "renders a sprite-sheet graphic effect as an animated preview instead of the raw grid" do
          content = {
            "name" => "Firebolt",
            "castTime" => nil,
            "globalCooldown" => 1.0,
            "graphicEffects" => [
              {"sourceURL" => "../graphics/animations/firebolt.sprites2x2.png", "duration" => 0.5, "spriteColumns" => 2, "spriteRows" => 2, "spriteFrameRate" => 8}
            ]
          }
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/firebolt.json")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: {content: Base64.encode64(content.to_json), encoding: "base64"}.to_json
            )
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/graphics/animations/firebolt.sprites2x2.png")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: {content: Base64.encode64("fake-png-bytes"), encoding: "base64"}.to_json
            )

          get "/build/abilities/firebolt"
          expect(response).to have_http_status(:ok)
          expect(response.body).not_to include("<img")
          expect(response.body).to include("@keyframes")
          expect(response.body).to include("steps(1) infinite")
          expect(response.body).to include("background-size: 200% 200%")
        end
      end
    end
  end
end
