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

        it "lists only zone files (not maps nested inside them, nor .full.json/.layout.json companions), linking each to play-testing" do
          stub_tree_listing("nevinera/delve-content", "zones", [
            "goblin-cave/goblin-cave.json",
            "goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json",
            "goblin-cave/goblin-cave.full.json",
            "goblin-cave/goblin-cave.layout.json"
          ])

          get "/build/zones"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include(">goblin-cave<")
          expect(response.body.scan(build_zone_play_path(id: "goblin-cave")).size).to eq(1)
          expect(response.body).not_to include("gc1-goblin-cave-entrance")
        end

        it "lists zones nested under a grouping folder, without their maps" do
          stub_tree_listing("nevinera/delve-content", "zones", [
            "small/forest/forest.json",
            "small/forest/glade/glade.json"
          ])

          get "/build/zones"
          expect(response.body).to include(build_zone_play_path(id: "small/forest"))
          expect(response.body).not_to include("glade")
        end
      end
    end
  end
end
