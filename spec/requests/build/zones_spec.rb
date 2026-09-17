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

        it "renders the JS editor shell with just the key - the zone's own content, layout positions, and maps lists/details are all fetched client-side, not here" do
          get "/build/zones/goblin-cave/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include('id="editor-root"')
          expect(response.body).to match(%r{src="/client/zoneEditor[^"]*\.js"})
          expect(response.body).to include('data-key="goblin-cave"')
          expect(response.body).to include(build_zones_path)
          # The point of this move: Rails never opens the zone file, its
          # layout file, or any map under its directory - WebMock would
          # raise if it tried.
          expect(WebMock).not_to have_requested(:get, %r{api\.github\.com/repos/nevinera/delve-content/contents/zones/})
        end
      end
    end
  end
end
