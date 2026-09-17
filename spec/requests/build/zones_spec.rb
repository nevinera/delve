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

        it "lists only zone files (not maps nested inside them), linking to the edit page" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: [
                {name: "goblin-cave.json", path: "zones/goblin-cave/goblin-cave.json", type: "file"},
                {name: "gc1-goblin-cave-entrance.json", path: "zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", type: "file"},
                {name: "goblin-cave.full.json", path: "zones/goblin-cave/goblin-cave.full.json", type: "file"}
              ].to_json
            )

          get "/build/zones"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include(">goblin-cave<")
          expect(response.body).to include(edit_build_zone_path(id: "goblin-cave"))
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
        stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones")
          .to_return(
            status: 200,
            headers: {"Content-Type" => "application/json"},
            body: keys.map { |k| {name: "#{k}.json", path: "zones/#{k}/#{k}.json", type: "file"} }.to_json
          )
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
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/#{zone_key}")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)
        end

        it "bootstraps a blank zone when the key doesn't exist yet in the repo" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/darkwood/darkwood.json")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)
          stub_empty_zone_directory("darkwood")

          get "/build/zones/darkwood/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include(CGI.escapeHTML("Darkwood"))
        end

        it "renders the JS editor shell, bootstrapping the zone from the repo" do
          content = {"name" => "Goblin Cave", "elvl" => 200, "private" => true, "maps" => []}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/goblin-cave.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(content.to_json), encoding: "base64"}.to_json)
          stub_empty_zone_directory("goblin-cave")

          get "/build/zones/goblin-cave/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include('id="editor-root"')
          expect(response.body).to match(%r{src="/client/zoneEditor[^"]*\.js"})
          expect(response.body).to include(CGI.escapeHTML(content.to_json))
        end

        it "includes each real map's identifier/name/connections/thumbnail as available-map-details, excluding the zone's own file and any .full.json" do
          content = {"name" => "Goblin Cave", "maps" => []}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/goblin-cave.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(content.to_json), encoding: "base64"}.to_json)
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: [
                {name: "goblin-cave.json", path: "zones/goblin-cave/goblin-cave.json", type: "file"},
                {name: "goblin-cave.full.json", path: "zones/goblin-cave/goblin-cave.full.json", type: "file"},
                {name: "gc1-goblin-cave-entrance.json", path: "zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", type: "file"}
              ].to_json
            )
          map_content = {"identifier" => "cave_entrance", "name" => "Cave Entrance", "connections" => [{"identifier" => "cave_mouth", "type" => "line"}]}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(map_content.to_json), encoding: "base64"}.to_json)

          get "/build/zones/goblin-cave/edit"

          expect(response).to have_http_status(:ok)
          expected = {"gc1-goblin-cave-entrance" => {"identifier" => "cave_entrance", "name" => "Cave Entrance", "connections" => map_content["connections"], "thumbnailUrl" => nil}}
          expect(response.body).to include(CGI.escapeHTML(expected.to_json))
        end
      end
    end

    describe "GET /build/zones/:id/available_maps" do
      before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

      it "returns the same map details as a JSON endpoint, for the zone editor's Refresh action" do
        stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave")
          .to_return(
            status: 200,
            headers: {"Content-Type" => "application/json"},
            body: [{name: "gc1-goblin-cave-entrance.json", path: "zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", type: "file"}].to_json
          )
        map_content = {"identifier" => "cave_entrance", "name" => "Cave Entrance"}
        stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json")
          .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(map_content.to_json), encoding: "base64"}.to_json)

        get "/build/zones/goblin-cave/available_maps"

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["gc1-goblin-cave-entrance"]["identifier"]).to eq("cave_entrance")
        expect(json["gc1-goblin-cave-entrance"]["name"]).to eq("Cave Entrance")
      end
    end
  end
end
