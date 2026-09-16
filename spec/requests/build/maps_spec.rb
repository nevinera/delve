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

        # #edit also loads the available-unit-types list for the unit
        # placement dropdown (see Build::MapsController#load_available_unit_types) -
        # stub an empty directory for tests that aren't exercising that.
        def stub_empty_unit_types_dir
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/unit_types")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)
        end

        # #edit also loads the available-items list for the loot table
        # dropdown (see Build::MapsController#list_item_keys).
        def stub_empty_items_dir
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/items")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)
        end

        it "renders the JS editor shell for a map that doesn't exist in the repo yet" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/gc2-interior/gc2-interior.json")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)
          stub_empty_unit_types_dir
          stub_empty_items_dir

          get "/build/maps/goblin-cave/gc2-interior/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include('id="editor-root"')
          expect(response.body).to match(%r{src="/client/mapEditor[^"]*\.js"})
          # The back link lives inside the React toolbar now, not a
          # server-rendered overlay - the editor-root just carries where it
          # points.
          expect(response.body).to include(%(data-back-url="#{build_maps_path}"))
          expect(response.body).to include(CGI.escapeHTML("Gc2 Interior"))
          expect(response.body).to include(CGI.escapeHTML('"lighting":"daylight"'))
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
          stub_empty_unit_types_dir
          stub_empty_items_dir

          get "/build/maps/goblin-cave/gc1-entrance/edit"

          expect(response).to have_http_status(:ok)
          expected_data_uri = "data:image/webp;base64,#{Base64.strict_encode64("fake-webp-bytes")}"
          expect(response.body).to include(CGI.escapeHTML(expected_data_uri))
          expect(response.body).to include(CGI.escapeHTML({"width" => 2048, "height" => 1536}.to_json))
        end
      end
    end

    describe "GET /build/maps/:id/available_unit_types" do
      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "without keys[], returns just the cheap key list - no unit type file is opened" do
          # Deliberately stubs *only* the directory listing - if the
          # controller opened any file to build this list (the way
          # Build::UnitTypesController#load_available_abilities does for
          # abilities), WebMock would raise on the unstubbed request and
          # fail this test. That's the point: a repo with hundreds of unit
          # types must stay cheap to list.
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/unit_types")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: [
                {name: "goblin-raider.json", path: "unit_types/goblin-raider.json", type: "file"},
                {name: "slime.json", path: "unit_types/slime.json", type: "file"}
              ].to_json
            )

          get "/build/maps/goblin-cave/gc1-entrance/available_unit_types"

          expect(response).to have_http_status(:ok)
          expect(JSON.parse(response.body)).to contain_exactly("goblin-raider", "slime")
        end

        it "with keys[], returns resolved details (including a token thumbnail and speedFactor) for exactly those keys" do
          goblin = {"name" => "Goblin Raider", "tokenRadius" => 2.5, "tokenImageUrl" => ["../assets/tokens/goblin.webp", "../assets/tokens/goblin2.webp"], "speedFactor" => 1.2}
          slime = {"name" => "Slime", "tokenRadius" => 1.5, "tokenImageUrl" => nil, "speedFactor" => 0.8}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/unit_types/goblin-raider.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(goblin.to_json), encoding: "base64"}.to_json)
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/unit_types/slime.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(slime.to_json), encoding: "base64"}.to_json)
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/assets/tokens/goblin.webp")
            .with(headers: {"Accept" => "application/vnd.github+json"})
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64("goblin-bytes"), encoding: "base64"}.to_json)

          get "/build/maps/goblin-cave/gc1-entrance/available_unit_types", params: {keys: ["goblin-raider", "slime"]}

          expect(response).to have_http_status(:ok)
          json = JSON.parse(response.body)
          expect(json.keys).to contain_exactly("goblin-raider", "slime")
          expect(json["goblin-raider"]["name"]).to eq("Goblin Raider")
          expect(json["goblin-raider"]["tokenRadius"]).to eq(2.5)
          expect(json["goblin-raider"]["tokenImageUrl"]).to eq("data:image/webp;base64,#{Base64.strict_encode64("goblin-bytes")}")
          expect(json["goblin-raider"]["speedFactor"]).to eq(1.2)
          expect(json["slime"]["tokenRadius"]).to eq(1.5)
          expect(json["slime"]["tokenImageUrl"]).to be_nil
          expect(json["slime"]["speedFactor"]).to eq(0.8)
        end

        it "with keys[], resolves a nested unit type's token relative to its own file" do
          shaman = {"name" => "Goblin Shaman", "tokenRadius" => 2.0, "tokenImageUrl" => "../../tokens/unit/goblin-shaman.webp"}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/unit_types/goblins/goblin-shaman.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(shaman.to_json), encoding: "base64"}.to_json)
          # "unit_types/goblins/goblin-shaman.json" resolving "../../tokens/unit/goblin-shaman.webp"
          # relative to its own directory ("unit_types/goblins") lands on "tokens/unit/goblin-shaman.webp" -
          # one "../" to leave unit_types/goblins/, a second to leave unit_types/ itself.
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/tokens/unit/goblin-shaman.webp")
            .with(headers: {"Accept" => "application/vnd.github+json"})
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64("shaman-bytes"), encoding: "base64"}.to_json)

          get "/build/maps/goblin-cave/gc1-entrance/available_unit_types", params: {keys: ["goblins/goblin-shaman"]}

          expect(response).to have_http_status(:ok)
          json = JSON.parse(response.body)
          expect(json.keys).to contain_exactly("goblins/goblin-shaman")
          expect(json["goblins/goblin-shaman"]["name"]).to eq("Goblin Shaman")
          expect(json["goblins/goblin-shaman"]["tokenImageUrl"]).to eq("data:image/webp;base64,#{Base64.strict_encode64("shaman-bytes")}")
        end

        it "with keys[], omits a key whose file no longer exists rather than erroring" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/unit_types/deleted-type.json")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)

          get "/build/maps/goblin-cave/gc1-entrance/available_unit_types", params: {keys: ["deleted-type"]}

          expect(response).to have_http_status(:ok)
          expect(JSON.parse(response.body)).to eq({})
        end
      end
    end

    describe "GET /build/maps/:id/available_items" do
      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "without keys[], returns just the cheap key list - no item file is opened" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/items")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: [
                {name: "sword-of-doom.json", path: "items/sword-of-doom.json", type: "file"},
                {name: "iron-shield.json", path: "items/iron-shield.json", type: "file"}
              ].to_json
            )

          get "/build/maps/goblin-cave/gc1-entrance/available_items"

          expect(response).to have_http_status(:ok)
          expect(JSON.parse(response.body)).to contain_exactly("sword-of-doom", "iron-shield")
        end

        it "with keys[], returns resolved details for exactly those keys" do
          sword = {"identifier" => "sword-of-doom", "name" => "Sword of Doom", "slot" => "main_hand"}
          shield = {"identifier" => "iron-shield", "name" => "Iron Shield", "slot" => "off_hand"}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/items/sword-of-doom.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(sword.to_json), encoding: "base64"}.to_json)
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/items/iron-shield.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(shield.to_json), encoding: "base64"}.to_json)

          get "/build/maps/goblin-cave/gc1-entrance/available_items", params: {keys: ["sword-of-doom", "iron-shield"]}

          expect(response).to have_http_status(:ok)
          json = JSON.parse(response.body)
          expect(json.keys).to contain_exactly("sword-of-doom", "iron-shield")
          expect(json["sword-of-doom"]).to eq({"identifier" => "sword-of-doom", "name" => "Sword of Doom", "slot" => "main_hand"})
          expect(json["iron-shield"]).to eq({"identifier" => "iron-shield", "name" => "Iron Shield", "slot" => "off_hand"})
        end

        it "with keys[], returns the item's own identifier field, even if it differs from the file key" do
          mismatched = {"identifier" => "actual-identifier", "name" => "Odd One", "slot" => "chest"}
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/items/file-key.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(mismatched.to_json), encoding: "base64"}.to_json)

          get "/build/maps/goblin-cave/gc1-entrance/available_items", params: {keys: ["file-key"]}

          expect(response).to have_http_status(:ok)
          expect(JSON.parse(response.body)["file-key"]["identifier"]).to eq("actual-identifier")
        end

        it "with keys[], omits a key whose file no longer exists rather than erroring" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/items/deleted-item.json")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)

          get "/build/maps/goblin-cave/gc1-entrance/available_items", params: {keys: ["deleted-item"]}

          expect(response).to have_http_status(:ok)
          expect(JSON.parse(response.body)).to eq({})
        end
      end
    end
  end
end
