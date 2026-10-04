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
        before do
          create(:github_installation, user: user, repo_full_name: "nevinera/delve-content")
          stub_branch_list("nevinera/delve-content", %w[main])
        end

        it "lists the classes directory contents, linking to the edit page" do
          stub_tree_listing("nevinera/delve-content", "classes", ["puncher.json", "puncher.full.json"])

          get "/build/classes"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include(">puncher<")
          expect(response.body).not_to include(">puncher.full<")
          expect(response.body).to include(edit_build_class_path(id: "puncher", branch: "main"))
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

        it "renders the JS editor shell with just the key and a back link - the class's own content and available abilities are fetched client-side, not here" do
          get "/build/classes/puncher/edit"

          expect(response).to have_http_status(:ok)
          expect(response.body).to include('id="editor-root"')
          expect(response.body).to match(%r{src="/client/classEditor[^"]*\.js"})
          expect(response.body).to include('data-key="puncher"')
          expect(response.body).to include(%(data-back-url="#{build_classes_path}"))
          # The point of this move: Rails never opens the class file, its
          # available-abilities directory, or any asset - WebMock would
          # raise if it tried.
          expect(WebMock).not_to have_requested(:get, %r{api\.github\.com/repos/nevinera/delve-content/contents/(classes|abilities|graphics)})
        end
      end
    end

    describe "GET /build/classes/:id/edit, publishing" do
      before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

      it "suggests the next minor version after the latest registered one" do
        create(:character_class, user:, identifier: "puncher", version: "0.5")
        create(:character_class, user:, identifier: "puncher", version: "0.10")
        get "/build/classes/puncher/edit"
        expect(response.body).to include('data-next-version="0.11"')
        expect(response.body).to include(%(data-publish-url="#{publish_build_class_path(id: "puncher")}"))
      end

      it "suggests 0.1 for a class with no versions" do
        get "/build/classes/puncher/edit"
        expect(response.body).to include('data-next-version="0.1"')
      end
    end

    describe "POST /build/classes/:id/publish" do
      let(:api) { "https://api.github.com/repos/nevinera/delve-content" }
      let(:raw) { "https://raw.githubusercontent.com/nevinera/delve-content" }
      let(:class_body) { File.read(Rails.root.join("spec/fixtures/classes/puncher.full.json")) }
      let!(:create_tag) do
        stub_request(:post, "#{api}/git/refs")
          .with(body: {ref: "refs/tags/puncher-0.6", sha: "saved"}.to_json)
          .to_return(status: 201, headers: {"Content-Type" => "application/json"}, body: {}.to_json)
      end

      def stub_json(url, body, status: 200)
        stub_request(:get, url).to_return(status:, headers: {"Content-Type" => "application/json"}, body: body.to_json)
      end

      before do
        create(:github_installation, user: user, repo_full_name: "nevinera/delve-content")
        stub_json(api, {private: false, default_branch: "main"})
        stub_json("#{api}/git/ref/tags/puncher-0.6", {message: "Not Found"}, status: 404)
        stub_json("#{api}/git/ref/heads/main", {object: {type: "commit", sha: "saved"}})
        stub_request(:get, "#{raw}/saved/classes/puncher.json").to_return(body: class_body)
      end

      def publish(id: "puncher", version: "0.6", branch: "main", expected_sha: "saved")
        post "/build/classes/#{id}/publish", params: {version:, branch:, expected_sha:}, as: :json
      end

      it "tags the saved commit and registers the version, which fetches itself" do
        expect { publish }.to have_enqueued_job(FetchCharacterClassContentJob)
        expect(create_tag).to have_been_requested
        expect(CharacterClass.sole).to have_attributes(
          user:, identifier: "puncher", version: "0.6",
          location: "#{raw}/refs/tags/puncher-0.6/classes/puncher.json"
        )
        expect(response.parsed_body).to eq("identifier" => "puncher", "version" => "0.6")
      end

      it "refuses when the branch has moved on since it was loaded" do
        expect { publish(expected_sha: "older") }.not_to change(CharacterClass, :count)
        expect(response).to have_http_status(:unprocessable_content)
        expect(response.parsed_body["error"]).to include("has moved on since it was loaded")
        expect(create_tag).not_to have_been_requested
      end

      it "refuses a class that doesn't validate at that commit" do
        stub_request(:get, "#{raw}/saved/classes/puncher.json").to_return(body: {name: "Puncher"}.to_json)
        expect { publish }.not_to change(CharacterClass, :count)
        expect(response.parsed_body["error"]).to start_with("classes/puncher.json isn't publishable:")
        expect(create_tag).not_to have_been_requested
      end

      it "refuses a malformed version" do
        publish(version: "v2")
        expect(response.parsed_body["error"]).to eq("Version must be two numbers, like 1.0.")
      end

      it "refuses a key that can't be a class identifier" do
        publish(id: "druid/bear")
        expect(response.parsed_body["error"]).to include("3+ lowercase letters, numbers and underscores")
      end

      it "refuses a version that's already registered" do
        create(:character_class, user:, identifier: "puncher", version: "0.6")
        expect { publish }.not_to change(CharacterClass, :count)
        expect(response.parsed_body["error"]).to eq("puncher 0.6 is already published.")
      end

      it "refuses a class another builder registered" do
        create(:character_class, identifier: "puncher", version: "0.5")
        publish
        expect(response.parsed_body["error"]).to eq("puncher belongs to another builder.")
        expect(create_tag).not_to have_been_requested
      end

      it "refuses a tag that already exists" do
        stub_json("#{api}/git/ref/tags/puncher-0.6", {object: {type: "commit", sha: "old"}})
        publish
        expect(response.parsed_body["error"]).to include("already exists")
        expect(create_tag).not_to have_been_requested
      end

      it "refuses a private repo" do
        stub_json(api, {private: true, default_branch: "main"})
        publish
        expect(response.parsed_body["error"]).to include("is private")
      end
    end
  end
end
