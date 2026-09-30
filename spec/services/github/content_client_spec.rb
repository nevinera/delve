require "rails_helper"

RSpec.describe Github::ContentClient do
  let(:user) { create(:user) }

  describe "#initialize" do
    it "raises NoRepositoryError when the user has no GitHub installation" do
      expect { described_class.new(user) }.to raise_error(Github::NoRepositoryError)
    end

    it "raises NoRepositoryError when the installation has no repo selected" do
      installation = create(:github_installation, user: user)
      installation.update_column(:repo_full_name, "")

      expect { described_class.new(user) }.to raise_error(Github::NoRepositoryError)
    end
  end

  describe "#list_directory" do
    context "with a fresh access token" do
      let!(:installation) do
        create(:github_installation, user: user, repo_full_name: "nevinera/delve-content",
          access_token: "gho_fresh", access_token_expires_at: 1.hour.from_now)
      end

      it "lists the directory contents without refreshing" do
        stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities")
          .with(headers: {"Authorization" => "Bearer gho_fresh"})
          .to_return(
            status: 200,
            headers: {"Content-Type" => "application/json"},
            body: [{name: "punch.json", path: "abilities/punch.json", type: "file"}].to_json
          )

        result = described_class.new(user).list_directory("abilities")
        expect(result).to eq([{"name" => "punch.json", "path" => "abilities/punch.json", "type" => "file"}])
      end
    end

    context "with an expired access token but a valid refresh token" do
      let!(:installation) do
        create(:github_installation, user: user, repo_full_name: "nevinera/delve-content",
          access_token: "gho_expired", access_token_expires_at: 1.hour.ago)
      end

      it "refreshes the token before listing" do
        stub_request(:post, "https://github.com/login/oauth/access_token")
          .with(body: hash_including("grant_type" => "refresh_token"))
          .to_return(
            status: 200,
            headers: {"Content-Type" => "application/json"},
            body: {access_token: "gho_refreshed", refresh_token: "ghr_new", expires_in: 28_800, refresh_token_expires_in: 15_811_200}.to_json
          )
        stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities")
          .with(headers: {"Authorization" => "Bearer gho_refreshed"})
          .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: [].to_json)

        described_class.new(user).list_directory("abilities")
        expect(installation.reload.access_token).to eq("gho_refreshed")
      end
    end

    context "with an expired refresh token" do
      let!(:installation) do
        create(:github_installation, user: user, repo_full_name: "nevinera/delve-content",
          refresh_token_expires_at: 1.day.ago)
      end

      it "raises ReauthRequiredError" do
        expect { described_class.new(user).list_directory("abilities") }.to raise_error(Github::ReauthRequiredError)
      end
    end
  end

  describe "#list_directory_recursive" do
    let!(:installation) do
      create(:github_installation, user: user, repo_full_name: "nevinera/delve-content",
        access_token: "gho_fresh", access_token_expires_at: 1.hour.from_now)
    end

    # Backed by Github::TreeListing now (see its own spec for the detailed
    # request-shape coverage) - just confirm ContentClient wires it up with
    # a fresh token and the installation's repo.
    it "delegates to Github::TreeListing, refreshing the token first if needed" do
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content")
        .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {default_branch: "main"}.to_json)
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/git/trees/main")
        .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {tree: [{path: "abilities", type: "tree", sha: "abilities-sha"}]}.to_json)
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/git/trees/abilities-sha?recursive=1")
        .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {tree: [{path: "punch.json", type: "blob", sha: "s1"}]}.to_json)

      result = described_class.new(user).list_directory_recursive("abilities")

      expect(result).to eq([{"name" => "punch.json", "path" => "abilities/punch.json", "type" => "file"}])
    end

    it "returns an empty array for a path that doesn't exist" do
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content")
        .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {default_branch: "main"}.to_json)
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/git/trees/main")
        .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {tree: []}.to_json)

      expect(described_class.new(user).list_directory_recursive("abilities")).to eq([])
    end
  end

  describe "#file_content" do
    let!(:installation) do
      create(:github_installation, user: user, repo_full_name: "nevinera/delve-content",
        access_token: "gho_fresh", access_token_expires_at: 1.hour.from_now)
    end

    it "decodes and returns the base64-encoded file content" do
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/punch.json")
        .with(headers: {"Authorization" => "Bearer gho_fresh"})
        .to_return(
          status: 200,
          headers: {"Content-Type" => "application/json"},
          body: {content: Base64.encode64('{"name":"Punch"}'), encoding: "base64"}.to_json
        )

      result = described_class.new(user).file_content("abilities/punch.json")
      expect(result).to eq('{"name":"Punch"}')
    end

    it "raises NotFoundError when GitHub returns a 404 for the path" do
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/missing.json")
        .to_return(
          status: 404,
          headers: {"Content-Type" => "application/json"},
          body: {message: "Not Found", documentation_url: "https://docs.github.com/rest"}.to_json
        )

      expect { described_class.new(user).file_content("abilities/missing.json") }.to raise_error(Github::NotFoundError)
    end
  end

  describe "repository and ref helpers" do
    let!(:installation) { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }
    let(:client) { described_class.new(user) }
    let(:api) { "https://api.github.com/repos/nevinera/delve-content" }

    def stub_json(url, body)
      stub_request(:get, url).to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: body.to_json)
    end

    it "reports the repo's visibility and default branch" do
      stub_json(api, {private: false, default_branch: "master"})
      expect(client.public_repo?).to be(true)
      expect(client.default_branch).to eq("master")
    end

    it "treats a private repo as not public" do
      stub_json(api, {private: true, default_branch: "main"})
      expect(client.public_repo?).to be(false)
    end

    it "resolves branch and tag commit shas" do
      stub_json("#{api}/git/ref/heads/master", {object: {type: "commit", sha: "b1"}})
      stub_json("#{api}/git/ref/tags/demo/v1", {object: {type: "commit", sha: "t1"}})
      expect(client.branch_sha("master")).to eq("b1")
      expect(client.tag_sha("demo/v1")).to eq("t1")
    end

    it "lists tag names under a prefix" do
      stub_json("#{api}/git/matching-refs/tags/demo/v", [{ref: "refs/tags/demo/v1"}])
      expect(client.tag_names("demo/v")).to eq(["demo/v1"])
    end
  end
end
