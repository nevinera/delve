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

        it "lists the abilities directory contents, linking to the edit page" do
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
          expect(response.body).to include(edit_build_ability_path(id: "punch"))
          expect(response.body).not_to include("github.com/nevinera/delve-content/blob")
        end
      end
    end

    describe "GET /build/abilities/new" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/abilities/new"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "renders a form asking only for a key" do
          get "/build/abilities/new"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include('name="key"')
        end
      end
    end

    describe "POST /build/abilities" do
      before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

      def stub_existing_abilities(names)
        stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities")
          .to_return(
            status: 200,
            headers: {"Content-Type" => "application/json"},
            body: names.map { |n| {name: "#{n}.json", path: "abilities/#{n}.json", type: "file"} }.to_json
          )
      end

      it "redirects to the edit page for an available key" do
        stub_existing_abilities(["punch"])

        post "/build/abilities", params: {key: "firebolt"}

        expect(response).to redirect_to(edit_build_ability_path(id: "firebolt"))
      end

      it "rejects a blank key" do
        post "/build/abilities", params: {key: "  "}

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("Key is required")
      end

      it "rejects a key with characters outside letters/numbers/underscore/hyphen" do
        post "/build/abilities", params: {key: "../../etc/passwd"}

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("letters, numbers, underscores, and hyphens")
      end

      it "rejects a key that's already taken in the repo's abilities directory" do
        stub_existing_abilities(["punch", "firebolt"])

        post "/build/abilities", params: {key: "firebolt"}

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("already taken")
      end
    end

    describe "GET /build/abilities/:id/edit" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/abilities/punch/edit"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with an expired refresh token" do
        before { create(:github_installation, user: user, refresh_token_expires_at: 1.day.ago) }

        it "redirects to reauth with an alert" do
          get "/build/abilities/punch/edit"
          expect(response).to redirect_to(github_reauth_path)
          expect(flash[:alert]).to include("GitHub authorization has expired")
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "bootstraps a blank ability when the key doesn't exist yet in the repo" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/fire_bolt.json")
            .to_return(
              status: 404,
              headers: {"Content-Type" => "application/json"},
              body: {message: "Not Found"}.to_json
            )

          get "/build/abilities/fire_bolt/edit"

          expect(response).to have_http_status(:ok)
          blank_ability = {
            "name" => "Fire Bolt", "description" => "", "castTime" => nil, "globalCooldown" => 1.0, "tags" => [],
            "graphicEffects" => [], "soundEffects" => [], "effects" => []
          }
          expect(response.body).to include(CGI.escapeHTML(blank_ability.to_json))
        end

        it "renders the JS editor shell, bootstrapping the ability and asset map as data attributes" do
          content = {
            "name" => "Punch",
            "castTime" => nil,
            "globalCooldown" => 0.5,
            "speed" => 60.0,
            "graphicEffects" => [
              {"sourceURL" => "../graphics/effects/punch-impact.webp", "duration" => 0.3, "when" => "impact"}
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

          get "/build/abilities/punch/edit"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include('<div id="editor-root"')
          expect(response.body).to include('src="/client/editor.js"')
          expect(response.body).to include(CGI.escapeHTML(content.to_json))
          expect(response.body).to include(CGI.escapeHTML({"../graphics/effects/punch-impact.webp" => "data:image/webp;base64,#{Base64.strict_encode64("fake-webp-bytes")}"}.to_json))
          expect(response.body).to include(build_abilities_path)
          expect(response.body).to include(CGI.escapeHTML({"duration" => 0.12, "url" => "/abilities/sounds/twang.ogg"}.to_json))
        end
      end
    end
  end
end
