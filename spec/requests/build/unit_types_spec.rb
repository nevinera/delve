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

        it "lists the unit_types directory contents, linking to the edit page" do
          stub_tree_listing("nevinera/delve-content", "unit_types", ["goblin-raider.json", "goblin-raider.full.json"])

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
        stub_tree_listing("nevinera/delve-content", "unit_types", names.map { |n| "#{n}.json" })
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

        it "renders the JS editor shell with just the key and a new-ability link - the unit type's own content and available abilities are fetched client-side, not here" do
          get "/build/unit_types/goblin-raider/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include('id="editor-root"')
          expect(response.body).to match(%r{src="/client/unitTypeEditor[^"]*\.js"})
          expect(response.body).to include('data-key="goblin-raider"')
          expect(response.body).to include(CGI.escapeHTML(new_build_ability_path(key: "units/goblin-raider/")))
          # The point of this move: Rails never opens the unit type file,
          # the abilities/units/ directory, or any asset - WebMock would
          # raise if it tried.
          expect(WebMock).not_to have_requested(:get, %r{api\.github\.com/repos/nevinera/delve-content/contents/(unit_types|abilities|graphics)})
        end
      end
    end
  end
end
