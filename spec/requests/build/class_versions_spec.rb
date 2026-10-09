require "rails_helper"

RSpec.describe "Build::ClassVersions", type: :request do
  let(:user) { create(:user) }
  let(:api) { "https://api.github.com/repos/nevinera/delve-content" }
  let(:raw) { "https://raw.githubusercontent.com/nevinera/delve-content" }
  let(:class_body) { File.read(Rails.root.join("spec/fixtures/classes/puncher.full.json")) }
  let(:tags) { %w[puncher-0.1 puncher-0.2 puncher-0.10 puncher-two-1.0] }

  def stub_json(url, body, status: 200)
    stub_request(:get, url).to_return(status:, headers: {"Content-Type" => "application/json"}, body: body.to_json)
  end

  before do
    sign_in user
    create(:github_installation, user:, repo_full_name: "nevinera/delve-content")
    stub_json(api, {private: false, default_branch: "main"})
    stub_json("#{api}/git/matching-refs/tags/puncher-", tags.map { |tag| {ref: "refs/tags/#{tag}"} })
  end

  describe "GET /build/classes/:id/versions" do
    it "mixes imported versions and not-imported tags, newest first" do
      create(:character_class, user:, identifier: "puncher", version: "0.2", name: "Puncher")
      get "/build/classes/puncher/versions"
      expect(response).to have_http_status(:ok)
      order = ["0.10", "0.2", "0.1"].map { |v| response.body.index(%(<span class="entry-title">#{v}</span>)) }
      expect(order).to eq(order.sort)
      expect(response.body.scan("not imported").size).to eq(2)
      expect(response.body).not_to include("1.0")
    end

    it "notes when the repo's tags can't be listed" do
      stub_json("#{api}/git/matching-refs/tags/puncher-", {message: "boom"}, status: 500)
      get "/build/classes/puncher/versions"
      expect(response.body).to include("be listed")
    end
  end

  describe "POST /build/classes/:id/versions" do
    before do
      stub_json("#{api}/git/ref/tags/puncher-0.1", {object: {type: "commit", sha: "tagged"}})
      stub_request(:get, "#{raw}/tagged/classes/puncher.json").to_return(body: class_body)
    end

    it "registers the tagged version, which fetches itself" do
      expect { post "/build/classes/puncher/versions", params: {version: "0.1"} }
        .to have_enqueued_job(FetchCharacterClassContentJob)
      expect(CharacterClass.sole).to have_attributes(
        user:, identifier: "puncher", version: "0.1",
        location: "#{raw}/refs/tags/puncher-0.1/classes/puncher.json"
      )
      expect(response).to redirect_to("/build/classes/puncher/versions")
    end

    it "refuses a tag that doesn't exist" do
      stub_json("#{api}/git/ref/tags/puncher-0.9", {message: "Not Found"}, status: 404)
      expect { post "/build/classes/puncher/versions", params: {version: "0.9"} }.not_to change(CharacterClass, :count)
      expect(flash[:alert]).to include("doesn't exist")
    end

    it "refuses a version that's already imported" do
      create(:character_class, user:, identifier: "puncher", version: "0.1")
      expect { post "/build/classes/puncher/versions", params: {version: "0.1"} }.not_to change(CharacterClass, :count)
      expect(flash[:alert]).to include("already imported")
    end

    it "refuses another builder's class" do
      create(:character_class, identifier: "puncher", version: "0.5")
      expect { post "/build/classes/puncher/versions", params: {version: "0.1"} }.not_to change(CharacterClass, :count)
      expect(flash[:alert]).to include("another builder")
    end

    it "refuses content that doesn't validate" do
      stub_request(:get, "#{raw}/tagged/classes/puncher.json").to_return(body: {name: "Puncher"}.to_json)
      expect { post "/build/classes/puncher/versions", params: {version: "0.1"} }.not_to change(CharacterClass, :count)
      expect(flash[:alert]).to include("isn't publishable")
    end
  end
end
