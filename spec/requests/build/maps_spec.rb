require "rails_helper"

RSpec.describe "Build::Maps", type: :request do
  let(:user) { create(:user) }

  context "when not logged in" do
    it "redirects index to login" do
      get "/build/maps"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    describe "GET /build/maps" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/maps"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "lists map files nested under zones/, linking to the edit page, and skips the zone's own json" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: [{name: "goblin-cave", path: "zones/goblin-cave", type: "dir"}].to_json
            )
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: [
                {name: "goblin-cave.json", path: "zones/goblin-cave/goblin-cave.json", type: "file"},
                {name: "gc1-entrance", path: "zones/goblin-cave/gc1-entrance", type: "dir"}
              ].to_json
            )
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/gc1-entrance")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: [
                {name: "gc1-entrance.json", path: "zones/goblin-cave/gc1-entrance/gc1-entrance.json", type: "file"},
                {name: "gc1-entrance.webp", path: "zones/goblin-cave/gc1-entrance/gc1-entrance.webp", type: "file"}
              ].to_json
            )

          get "/build/maps"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include(">goblin-cave/gc1-entrance<")
          expect(response.body).not_to include(">goblin-cave<")
          expect(response.body).to include(edit_build_map_path(id: "goblin-cave/gc1-entrance"))
        end
      end
    end

    describe "GET /build/maps/new" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/maps/new"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "renders a form asking only for a key" do
          get "/build/maps/new"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include('name="key"')
        end
      end
    end

    describe "POST /build/maps" do
      before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

      def stub_existing_maps(paths)
        stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones")
          .to_return(
            status: 200,
            headers: {"Content-Type" => "application/json"},
            body: paths.map { |p| {name: File.basename(p), path: p, type: "file"} }.to_json
          )
      end

      it "redirects to the edit page for an available key" do
        stub_existing_maps(["zones/goblin-cave/gc1-entrance/gc1-entrance.json"])

        post "/build/maps", params: {key: "goblin-cave/gc2-interior"}

        expect(response).to redirect_to(edit_build_map_path(id: "goblin-cave/gc2-interior"))
      end

      it "rejects a blank key" do
        post "/build/maps", params: {key: "  "}

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("Key is required")
      end

      it "rejects a key that's already taken" do
        stub_existing_maps(["zones/goblin-cave/gc1-entrance/gc1-entrance.json"])

        post "/build/maps", params: {key: "goblin-cave/gc1-entrance"}

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("already taken")
      end
    end

    describe "GET /build/maps/:id/edit" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/maps/goblin-cave/gc1-entrance/edit"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "renders the JS editor shell for a map that doesn't exist in the repo yet" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/gc2-interior/gc2-interior.json")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)

          get "/build/maps/goblin-cave/gc2-interior/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include('id="editor-root"')
          expect(response.body).to match(%r{src="/client/mapEditor[^"]*\.js"})
          # The back link lives inside the React toolbar now, not a
          # server-rendered overlay - the editor-root just carries where it
          # points.
          expect(response.body).to include(%(data-back-url="#{build_maps_path}"))
          expect(response.body).to include(CGI.escapeHTML("Gc2 Interior"))
        end

        it "inlines an existing map's image as a data URI, resolved relative to the map's own file" do
          map_content = {
            "identifier" => "gc1-entrance", "name" => "Gc1 Entrance",
            "imageUrl" => "./gc1-entrance.webp",
            "pixelDimensions" => {"width" => 2048, "height" => 1536},
            "feetDimensions" => {"width" => 60.0, "height" => 45.0},
            "barriers" => [], "connections" => [], "units" => []
          }
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/gc1-entrance/gc1-entrance.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(map_content.to_json), encoding: "base64"}.to_json)
          # The raw media type (not the default application/vnd.github+json)
          # returns the exact bytes directly, no base64/JSON envelope - see
          # Github::ApiClient#raw_repository_contents. This is what actually
          # fixes real map images, which routinely exceed the default
          # Contents API's 1MB inline-content threshold.
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/gc1-entrance/gc1-entrance.webp")
            .with(headers: {"Accept" => "application/vnd.github.raw+json"})
            .to_return(status: 200, headers: {"Content-Type" => "image/webp"}, body: "fake-webp-bytes")

          get "/build/maps/goblin-cave/gc1-entrance/edit"

          expect(response).to have_http_status(:ok)
          expected_data_uri = "data:image/webp;base64,#{Base64.strict_encode64("fake-webp-bytes")}"
          expect(response.body).to include(CGI.escapeHTML(expected_data_uri))
          expect(response.body).to include(CGI.escapeHTML({"width" => 2048, "height" => 1536}.to_json))
        end
      end
    end
  end
end
