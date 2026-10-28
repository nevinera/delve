require "rails_helper"

RSpec.describe "Worlds", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  let(:user) { create(:user) }

  def stub_github(path, body, status: 200)
    stub_request(:get, "https://api.github.com#{path}")
      .to_return(status:, headers: {"Content-Type" => "application/json"}, body: body.to_json)
  end

  def stub_repos(*names)
    stub_github("/user/installations", {installations: [{id: 7}]})
    repos = names.map { |n| {name: n.split("/").last, full_name: n, private: false} }
    stub_github("/user/installations/7/repositories?per_page=100&page=1", {repositories: repos})
  end

  it "needs a signed-in user" do
    get worlds_path
    expect(response).to redirect_to("/login")
  end

  context "when signed in" do
    before { sign_in user }

    it "asks you to connect GitHub" do
      get worlds_path
      expect(response.body).to include("Connect GitHub")
    end

    it "lists your worlds, then the other repos you could open" do
      create(:github_connection, user:)
      create(:world, user:, repo: "me/mine", name: "Thornwood")
      stub_repos("me/mine", "me/other")
      get worlds_path
      expect(response.body).to include("Thornwood")
      expect(response.body).to include(%(href="/editor?from=github%2Fme%2Fmine"))
      expect(response.body).to include(%(href="/editor?from=github%2Fme%2Fother"))
      expect(response.body.scan("me/mine").size).to eq(1)
    end

    it "says when it can't list your repos" do
      create(:github_connection, user:)
      stub_github("/user/installations", {}, status: 500)
      get worlds_path
      expect(response.body).to include("Couldn't list your repos")
    end

    describe "recording a world the editor opened" do
      before { create(:github_connection, user:) }

      it "records it as yours, and again on each open" do
        stub_github("/repos/me/thorn", {full_name: "me/Thorn", default_branch: "trunk"})
        expect { post worlds_path, params: {repo: "me/thorn", name: "Thornwood"}, as: :json }.to change(World, :count).by(1)
        expect(response.parsed_body).to eq("recorded" => true)
        expect(user.worlds.sole).to have_attributes(repo: "me/Thorn", name: "Thornwood", default_branch: "trunk")

        travel 1.hour do
          expect { post worlds_path, params: {repo: "me/thorn", name: "Renamed"}, as: :json }.not_to change(World, :count)
          expect(user.worlds.sole).to have_attributes(name: "Renamed", opened_at: be_within(1.second).of(Time.current))
        end
      end

      it "leaves someone else's world on their list" do
        theirs = create(:world, repo: "them/world", name: "Theirs")
        stub_github("/repos/them/world", {full_name: "them/world", default_branch: "main"})
        post worlds_path, params: {repo: "them/world", name: "Mine now"}, as: :json
        expect(response.parsed_body).to eq("recorded" => false)
        expect(theirs.reload.name).to eq("Theirs")
      end

      it "refuses a repo the app can't see" do
        stub_github("/repos/me/secret", {message: "Not Found"}, status: 404)
        expect { post worlds_path, params: {repo: "me/secret"}, as: :json }.not_to change(World, :count)
        expect(response).to have_http_status(:not_found)
      end
    end

    it "refuses to record a world without GitHub" do
      post worlds_path, params: {repo: "me/thorn"}, as: :json
      expect(response).to have_http_status(:unauthorized)
    end
  end
end
