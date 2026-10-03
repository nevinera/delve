require "rails_helper"

RSpec.describe "Build::WorldEditor", type: :request do
  let(:user) { create(:user) }

  before { sign_in user }

  describe "GET /build/world_editor/:id" do
    it "mounts the editor for the world, with a way back to the worlds list" do
      create(:github_installation, user:, repo_full_name: "builder/content")
      get "/build/world_editor/small"
      expect(response).to have_http_status(:ok)
      expect(response.body).to include('data-key="small"', %(data-back-url="#{build_worlds_path}"))
    end

    it "sends a user with no GitHub connection to connect one" do
      get "/build/world_editor/small"
      expect(response).to redirect_to(github_connect_path)
    end
  end
end
