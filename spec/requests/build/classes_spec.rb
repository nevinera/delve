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
          stub_tree_listing("nevinera/delve-content", "classes", ["puncher.json", "puncher.full.json"])

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
        stub_tree_listing("nevinera/delve-content", "classes", names.map { |n| "#{n}.json" })
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

        it "renders the JS editor shell with just the key and a new-ability link - the class's own content and available abilities are fetched client-side, not here" do
          get "/build/classes/puncher/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include('id="editor-root"')
          expect(response.body).to match(%r{src="/client/classEditor[^"]*\.js"})
          expect(response.body).to include('data-key="puncher"')
          expect(response.body).to include(CGI.escapeHTML(new_build_ability_path(key: "classes/puncher/")))
          # The point of this move: Rails never opens the class file, its
          # available-abilities directory, or any asset - WebMock would
          # raise if it tried.
          expect(WebMock).not_to have_requested(:get, %r{api\.github\.com/repos/nevinera/delve-content/contents/(classes|abilities|graphics)})
        end
      end
    end
  end
end
