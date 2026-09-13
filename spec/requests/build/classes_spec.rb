require "rails_helper"

RSpec.describe "Build::Classes", type: :request do
  let(:user) { create(:user) }

  context "when not logged in" do
    it "redirects index to login" do
      get "/build/classes"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    describe "GET /build/classes" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/classes"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "lists the classes directory contents, linking to the edit page" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/classes")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: [
                {name: "puncher.json", path: "classes/puncher.json", type: "file"},
                {name: "puncher.full.json", path: "classes/puncher.full.json", type: "file"}
              ].to_json
            )

          get "/build/classes"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include(">puncher<")
          expect(response.body).not_to include(">puncher.full<")
          expect(response.body).to include(edit_build_class_path(id: "puncher"))
        end
      end
    end

    describe "GET /build/classes/new" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/classes/new"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "renders a form asking only for a key" do
          get "/build/classes/new"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include('name="key"')
        end
      end
    end

    describe "POST /build/classes" do
      before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

      def stub_existing_classes(names)
        stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/classes")
          .to_return(
            status: 200,
            headers: {"Content-Type" => "application/json"},
            body: names.map { |n| {name: "#{n}.json", path: "classes/#{n}.json", type: "file"} }.to_json
          )
      end

      it "redirects to the edit page for an available key" do
        stub_existing_classes(["puncher"])

        post "/build/classes", params: {key: "druid"}

        expect(response).to redirect_to(edit_build_class_path(id: "druid"))
      end

      it "rejects a blank key" do
        post "/build/classes", params: {key: "  "}

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("Key is required")
      end

      it "rejects a key that's already taken" do
        stub_existing_classes(["puncher"])

        post "/build/classes", params: {key: "puncher"}

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("already taken")
      end
    end

    describe "GET /build/classes/:id/edit" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/classes/puncher/edit"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        def stub_empty_abilities_dir(key)
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/classes/#{key}")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)
        end

        it "bootstraps a blank class when the key doesn't exist yet in the repo" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/classes/druid.json")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)
          stub_empty_abilities_dir("druid")

          get "/build/classes/druid/edit"

          expect(response).to have_http_status(:ok)
          blank_class = {
            "name" => "Druid", "description" => "", "colors" => {"major" => "888888", "minor" => "CCCCCC"},
            "resources" => [], "powers" => [], "primaryStats" => [], "secondaryStats" => [], "wields" => []
          }
          expect(response.body).to include(CGI.escapeHTML(blank_class.to_json))
        end

        it "renders the JS editor shell, bootstrapping the class and available abilities as data attributes" do
          content = {
            "name" => "Puncher",
            "colors" => {"major" => "8B4513", "minor" => "F4A460"},
            "primaryStats" => ["strength"],
            "secondaryStats" => ["crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "recovery_rating"],
            "wields" => ["axe", "dagger"],
            "powers" => [{"$ref" => "../abilities/classes/puncher/punch.json", "referenceTo" => "ability"}]
          }
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/classes/puncher.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(content.to_json), encoding: "base64"}.to_json)

          punch_ability = {"name" => "Punch", "castTime" => nil, "globalCooldown" => 0.5, "iconURL" => "../graphics/icons/punch.svg"}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/classes/puncher")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: [{name: "punch.json", path: "abilities/classes/puncher/punch.json", type: "file"}].to_json
            )
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/classes/puncher/punch.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(punch_ability.to_json), encoding: "base64"}.to_json)
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/classes/graphics/icons/punch.svg")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64("fake-svg-bytes"), encoding: "base64"}.to_json)

          get "/build/classes/puncher/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include('id="editor-root"')
          expect(response.body).to match(%r{src="/client/classEditor[^"]*\.js"})
          expect(response.body).to include(CGI.escapeHTML(content.to_json))
          expect(response.body).to include(CGI.escapeHTML("classes/puncher/punch"))
          expect(response.body).to include(CGI.escapeHTML({"../graphics/icons/punch.svg" => "data:image/svg+xml;base64,#{Base64.strict_encode64("fake-svg-bytes")}"}.to_json))
        end

        it "links to a new ability pre-filled under the class's own abilities subdirectory" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/classes/druid.json")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)
          stub_empty_abilities_dir("druid")

          get "/build/classes/druid/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include(CGI.escapeHTML(new_build_ability_path(key: "classes/druid/")))
        end
      end
    end
  end
end
