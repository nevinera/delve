require "rails_helper"

RSpec.describe "Build::Items", type: :request do
  let(:user) { create(:user) }

  context "when not logged in" do
    it "redirects index to login" do
      get "/build/items"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    describe "GET /build/items" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/items"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "lists the items directory contents, linking to the edit page" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/items")
            .to_return(
              status: 200,
              headers: {"Content-Type" => "application/json"},
              body: [{name: "sword-of-doom.json", path: "items/sword-of-doom.json", type: "file"}].to_json
            )

          get "/build/items"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include(">sword-of-doom<")
          expect(response.body).to include(edit_build_item_path(id: "sword-of-doom"))
        end
      end
    end

    describe "GET /build/items/new" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/items/new"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "renders a form asking only for a key" do
          get "/build/items/new"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include('name="key"')
        end
      end
    end

    describe "POST /build/items" do
      before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

      def stub_existing_items(names)
        stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/items")
          .to_return(
            status: 200,
            headers: {"Content-Type" => "application/json"},
            body: names.map { |n| {name: "#{n}.json", path: "items/#{n}.json", type: "file"} }.to_json
          )
      end

      it "redirects to the edit page for an available key" do
        stub_existing_items(["sword-of-doom"])

        post "/build/items", params: {key: "bulwark-of-the-warband"}

        expect(response).to redirect_to(edit_build_item_path(id: "bulwark-of-the-warband"))
      end

      it "rejects a blank key" do
        post "/build/items", params: {key: "  "}

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("Key is required")
      end

      it "rejects a key that's already taken" do
        stub_existing_items(["sword-of-doom"])

        post "/build/items", params: {key: "sword-of-doom"}

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.body).to include("already taken")
      end
    end

    describe "GET /build/items/:id/edit" do
      context "without a github installation" do
        it "redirects to the github connect page" do
          get "/build/items/sword-of-doom/edit"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with a connected repository" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "bootstraps a blank item when the key doesn't exist yet in the repo" do
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/items/bulwark-of-the-warband.json")
            .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)

          get "/build/items/bulwark-of-the-warband/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include(CGI.escapeHTML("Bulwark Of The Warband"))
        end

        it "renders the JS editor shell, bootstrapping the item from the repo" do
          content = {
            "identifier" => "sword-of-doom",
            "name" => "Sword of Doom",
            "slot" => "main_hand",
            "weaponType" => "sword",
            "elvl" => 584,
            "primary" => "strength",
            "secondaries" => ["stamina", "crit_rating", "haste_rating"]
          }
          stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/items/sword-of-doom.json")
            .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {content: Base64.encode64(content.to_json), encoding: "base64"}.to_json)

          get "/build/items/sword-of-doom/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include('id="editor-root"')
          expect(response.body).to match(%r{src="/client/itemEditor[^"]*\.js"})
          expect(response.body).to include(CGI.escapeHTML(content.to_json))
        end
      end
    end
  end
end
