require "rails_helper"

RSpec.describe "Build::UnitTypes", type: :request do
  let(:user) { create(:user) }

  context "when not logged in" do
    it "redirects index to login" do
      get "/build/unit_types"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    describe "GET /build/unit_types" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/unit_types"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "lists the unit-types directory contents, linking to the edit page" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/unit-types")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: [
                {name: "goblin-raider.json", path: "unit-types/goblin-raider.json", type: "file"},
                {name: "goblin-raider.full.json", path: "unit-types/goblin-raider.full.json", type: "file"}
              ].to_json
            )

          get "/build/unit_types"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include(">goblin-raider<")
          expect(response.body).not_to include(">goblin-raider.full<")
          expect(response.body).to include(edit_build_unit_type_path(id: "goblin-raider"))
        end
      end
    end

    describe "GET /build/unit_types/new" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/unit_types/new"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "renders a form asking only for a key" do
          get "/build/unit_types/new"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include('name="key"')
        end
      end
    end

    describe "POST /build/unit_types" do
      before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

      def stub_existing_unit_types(names)
        stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/unit-types")
          .to_return(
            status: 200,
            headers: {"Content-Type" => "application/json"},
            body: names.map { |n| {name: "#{n}.json", path: "unit-types/#{n}.json", type: "file"} }.to_json
          )
      end

      it "redirects to the edit page for an available key" do
        stub_existing_unit_types(["goblin-raider"])

        post "/build/unit_types", params: {key: "goblin-archer"}

        expect(response).to redirect_to(edit_build_unit_type_path(id: "goblin-archer"))
      end

      it "rejects a blank key" do
        post "/build/unit_types", params: {key: "  "}

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("Key is required")
      end

      it "rejects a key that's already taken" do
        stub_existing_unit_types(["goblin-raider"])

        post "/build/unit_types", params: {key: "goblin-raider"}

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("already taken")
      end
    end

    describe "GET /build/unit_types/:id/edit" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/unit_types/goblin-raider/edit"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        def stub_empty_abilities_dir(key)
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/units/#{key}")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)
        end

        it "bootstraps a blank unit type when the key doesn't exist yet in the repo" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/unit-types/goblin-archer.json")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)
          stub_empty_abilities_dir("goblin-archer")

          get "/build/unit_types/goblin-archer/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include(CGI.escapeHTML("Goblin Archer"))
        end

        it "renders the JS editor shell, bootstrapping the unit type and available abilities as data attributes" do
          content = {
            "name" => "Goblin Raider",
            "tokenImageUrl" => [],
            "tokenRadius" => 1.5,
            "maxHP" => 20,
            "dps" => 4.0,
            "attackSpeed" => 1.0,
            "resource" => {"name" => "energy", "color" => "888888", "max" => 100.0, "defaultValue" => 100.0, "returnRate" => 0.0, "isFluid" => true},
            "powers" => [{"$ref" => "../abilities/units/goblin-raider/slash.json", "referenceTo" => "ability"}]
          }
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/unit-types/goblin-raider.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(content.to_json), encoding: "base64"}.to_json)

          slash_ability = {"name" => "Slash", "castTime" => nil, "globalCooldown" => 1.0}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/units/goblin-raider")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: [{name: "slash.json", path: "abilities/units/goblin-raider/slash.json", type: "file"}].to_json
            )
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/units/goblin-raider/slash.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(slash_ability.to_json), encoding: "base64"}.to_json)

          get "/build/unit_types/goblin-raider/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include('id="editor-root"')
          expect(response.body).to match(%r{src="/client/unitTypeEditor[^"]*\.js"})
          expect(response.body).to include(CGI.escapeHTML(content.to_json))
          expect(response.body).to include(CGI.escapeHTML("units/goblin-raider/slash"))
        end

        it "links to a new ability pre-filled under the unit type's own abilities subdirectory" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/unit-types/goblin-archer.json")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)
          stub_empty_abilities_dir("goblin-archer")

          get "/build/unit_types/goblin-archer/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include(CGI.escapeHTML(new_build_ability_path(key: "units/goblin-archer/")))
        end
      end
    end

    describe "GET /build/unit_types/:id/available_abilities" do
      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "returns the current available-abilities map as JSON" do
          slash_ability = {"name" => "Slash", "castTime" => nil, "globalCooldown" => 1.0}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/units/goblin-raider")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: [{name: "slash.json", path: "abilities/units/goblin-raider/slash.json", type: "file"}].to_json
            )
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/units/goblin-raider/slash.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(slash_ability.to_json), encoding: "base64"}.to_json)

          get "/build/unit_types/goblin-raider/available_abilities"

          expect(response).to have_http_status(:ok)
          json = JSON.parse(response.body)
          expect(json.keys).to eq(["units/goblin-raider/slash"])
          expect(json["units/goblin-raider/slash"]["ability"]["name"]).to eq("Slash")
        end
      end
    end
  end
end
