require "rails_helper"

RSpec.describe "Build::Zones", type: :request do
  let(:user) { create(:user) }

  context "when not logged in" do
    it "redirects index to login" do
      get "/build/zones"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    describe "GET /build/zones" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/zones"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "lists only zone files (not maps nested inside them, nor .full.json/.layout.json companions), linking to the edit page" do
          stub_tree_listing("nevinera/delve-content", "zones", [
            "goblin-cave/goblin-cave.json",
            "goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json",
            "goblin-cave/goblin-cave.full.json",
            "goblin-cave/goblin-cave.layout.json"
          ])

          get "/build/zones"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include(">goblin-cave<")
          expect(response.body.scan(edit_build_zone_path(id: "goblin-cave")).size).to eq(1)
          expect(response.body).not_to include("gc1-goblin-cave-entrance")
        end
      end
    end

    describe "GET /build/zones/new" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/zones/new"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "renders a form asking only for a key" do
          get "/build/zones/new"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include('name="key"')
        end
      end
    end

    describe "POST /build/zones" do
      before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

      def stub_existing_zones(keys)
        stub_tree_listing("nevinera/delve-content", "zones", keys.map { |k| "#{k}/#{k}.json" })
      end

      it "redirects to the edit page for an available key" do
        stub_existing_zones(["goblin-cave"])

        post "/build/zones", params: {key: "darkwood"}

        expect(response).to redirect_to(edit_build_zone_path(id: "darkwood"))
      end

      it "rejects a blank key" do
        post "/build/zones", params: {key: "  "}

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("Key is required")
      end

      it "rejects a key that's already taken" do
        stub_existing_zones(["goblin-cave"])

        post "/build/zones", params: {key: "goblin-cave"}

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("already taken")
      end
    end

    describe "GET /build/zones/:id/edit" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/zones/goblin-cave/edit"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        def stub_empty_zone_directory(zone_key)
          stub_missing_tree_listing("nevinera/delve-content", "zones/#{zone_key}")
        end

        def stub_missing_layout(zone_key)
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/#{zone_key}/#{zone_key}.layout.json")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)
        end

        it "bootstraps a blank zone when the key doesn't exist yet in the repo" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/darkwood/darkwood.json")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)
          stub_missing_layout("darkwood")
          stub_empty_zone_directory("darkwood")

          get "/build/zones/darkwood/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include(CGI.escapeHTML("Darkwood"))
        end

        it "renders the JS editor shell, bootstrapping the zone from the repo" do
          content = {"name" => "Goblin Cave", "elvl" => 200, "private" => true, "maps" => []}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/goblin-cave.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(content.to_json), encoding: "base64"}.to_json)
          stub_missing_layout("goblin-cave")
          stub_empty_zone_directory("goblin-cave")

          get "/build/zones/goblin-cave/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include('id="editor-root"')
          expect(response.body).to match(%r{src="/client/zoneEditor[^"]*\.js"})
          expect(response.body).to include(CGI.escapeHTML(content.to_json))
          expect(response.body).to include(build_zones_path)
        end

        it "loads persisted layout positions when a <zone>.layout.json file exists" do
          content = {"name" => "Goblin Cave", "maps" => []}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/goblin-cave.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(content.to_json), encoding: "base64"}.to_json)
          layout = {"positions" => {"gc1-goblin-cave-entrance" => {"x" => 12.5, "y" => -8.0}}}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/goblin-cave.layout.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(layout.to_json), encoding: "base64"}.to_json)
          stub_empty_zone_directory("goblin-cave")

          get "/build/zones/goblin-cave/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include(CGI.escapeHTML(layout["positions"].to_json))
        end

        it "prefetches full detail only for maps the zone already references, not every map under its directory" do
          content = {"name" => "Goblin Cave", "maps" => [{"$ref" => "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", "referenceTo" => "map"}]}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/goblin-cave.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(content.to_json), encoding: "base64"}.to_json)
          stub_missing_layout("goblin-cave")
          stub_tree_listing("nevinera/delve-content", "zones/goblin-cave", [
            "goblin-cave.json",
            "goblin-cave.full.json",
            "gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json",
            "gc2-goblin-cave-interior/gc2-goblin-cave-interior.json"
          ])
          map_content = {
            "identifier" => "cave_entrance", "name" => "Cave Entrance",
            "connections" => [{"identifier" => "cave_mouth", "type" => "line"}],
            "units" => [{"unitType" => "goblin_raider", "position" => {"x" => 1, "y" => 1}, "hostility" => "hostile", "lootTable" => {"sword-of-doom" => 10}}]
          }
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(map_content.to_json), encoding: "base64"}.to_json)
          # Deliberately no stub for gc2-goblin-cave-interior.json - it's not
          # referenced, so #edit must never open it; WebMock would raise if
          # it tried.

          get "/build/zones/goblin-cave/edit"

          expect(response).to have_http_status(:ok)

          expected_details = {
            "gc1-goblin-cave-entrance" => {
              "identifier" => "cave_entrance", "name" => "Cave Entrance",
              "connections" => map_content["connections"],
              "units" => [{"unitType" => "goblin_raider", "itemKeys" => ["sword-of-doom"]}],
              "thumbnailUrl" => nil
            }
          }
          expect(response.body).to include(CGI.escapeHTML(expected_details.to_json))

          expected_keys = %w[gc1-goblin-cave-entrance gc2-goblin-cave-interior]
          expect(response.body).to include(CGI.escapeHTML(expected_keys.to_json))
        end
      end
    end

    describe "GET /build/zones/:id/available_maps" do
      before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

      def stub_zone_directory(relative_paths)
        stub_tree_listing("nevinera/delve-content", "zones/goblin-cave", relative_paths)
      end

      it "with no keys[], returns the cheap bare-key list only - no map file is opened" do
        stub_zone_directory(["gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json"])
        # Deliberately no stub for the map file itself - WebMock would raise
        # if the cheap path tried to open it.

        get "/build/zones/goblin-cave/available_maps"

        expect(response).to have_http_status(:ok)
        expect(JSON.parse(response.body)).to eq(["gc1-goblin-cave-entrance"])
      end

      it "with keys[], returns full detail for exactly those keys" do
        stub_zone_directory(["gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json"])
        map_content = {"identifier" => "cave_entrance", "name" => "Cave Entrance"}
        stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json")
          .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(map_content.to_json), encoding: "base64"}.to_json)

        get "/build/zones/goblin-cave/available_maps", params: {keys: ["gc1-goblin-cave-entrance"]}

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["gc1-goblin-cave-entrance"]["identifier"]).to eq("cave_entrance")
        expect(json["gc1-goblin-cave-entrance"]["name"]).to eq("Cave Entrance")
      end
    end
  end
end
