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
          stub_tree_listing("nevinera/delve-content", "zones", [
            "goblin-cave/goblin-cave.json",
            "goblin-cave/gc1-entrance/gc1-entrance.json",
            "goblin-cave/gc1-entrance/gc1-entrance.webp"
          ])

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

        it "pre-fills the key field from a prefix param (the zone editor's Create Map link)" do
          get "/build/maps/new", params: {prefix: "goblin-cave/"}
          expect(response).to have_http_status(:ok)
          expect(response.body).to include('value="goblin-cave/"')
        end
      end
    end

    describe "POST /build/maps" do
      before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

      def stub_existing_maps(paths)
        stub_tree_listing("nevinera/delve-content", "zones", paths.map { |p| p.delete_prefix("zones/") })
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

        it "renders the JS editor shell with just the key and the toolbar/link URLs - the map's own content, image, and unit-type/item lists are all fetched client-side, not here" do
          get "/build/maps/goblin-cave/gc2-interior/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include('id="editor-root"')
          expect(response.body).to match(%r{src="/client/mapEditor[^"]*\.js"})
          expect(response.body).to include('data-key="goblin-cave/gc2-interior"')
          # The back link lives inside the React toolbar now, not a
          # server-rendered overlay - the editor-root just carries where it
          # points.
          expect(response.body).to include(%(data-back-url="#{build_maps_path}"))
          # The point of this move: Rails never opens the map file, its
          # background image, or the unit_types/items directories -
          # WebMock would raise if it tried.
          expect(WebMock).not_to have_requested(:get, %r{api\.github\.com/repos/nevinera/delve-content/contents/(zones|unit_types|items)})
        end
      end
    end
  end
end
