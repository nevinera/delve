require "rails_helper"

RSpec.describe Github::ApiClient do
  describe "#installation_repositories" do
    it "returns the repositories for the given installation, authenticated with the token" do
      stub_request(:get, "https://api.github.com/user/installations/42/repositories")
        .with(headers: {"Authorization" => "Bearer gho_x", "Accept" => "application/vnd.github+json"})
        .to_return(
          status: 200,
          headers: {"Content-Type" => "application/json"},
          body: {repositories: [{full_name: "nevinera/delve-content"}]}.to_json
        )

      repos = described_class.new("gho_x").installation_repositories(42)
      expect(repos).to eq([{"full_name" => "nevinera/delve-content"}])
    end
  end

  describe "#repository_contents" do
    it "returns the parsed contents listing, authenticated with the token" do
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities")
        .with(headers: {"Authorization" => "Bearer gho_x", "Accept" => "application/vnd.github+json"})
        .to_return(
          status: 200,
          headers: {"Content-Type" => "application/json"},
          body: [{name: "punch.json", path: "abilities/punch.json", type: "file"}].to_json
        )

      contents = described_class.new("gho_x").repository_contents("nevinera/delve-content", "abilities")
      expect(contents).to eq([{"name" => "punch.json", "path" => "abilities/punch.json", "type" => "file"}])
    end
  end

  describe "#commit_sha" do
    let(:client) { described_class.new("gho_x") }
    let(:base) { "https://api.github.com/repos/nevinera/delve-content/git" }

    def stub_json(url, body, status: 200)
      stub_request(:get, url).to_return(status:, headers: {"Content-Type" => "application/json"}, body: body.to_json)
    end

    it "returns the commit a branch points at" do
      stub_json("#{base}/ref/heads/master", {object: {type: "commit", sha: "c0ffee"}})
      expect(client.commit_sha("nevinera/delve-content", "heads/master")).to eq("c0ffee")
    end

    it "dereferences an annotated tag to its commit" do
      stub_json("#{base}/ref/tags/v1", {object: {type: "tag", sha: "7a9"}})
      stub_json("#{base}/tags/7a9", {object: {type: "commit", sha: "c0ffee"}})
      expect(client.commit_sha("nevinera/delve-content", "tags/v1")).to eq("c0ffee")
    end

    it "raises NotFoundError for a missing ref" do
      stub_json("#{base}/ref/tags/nope", {message: "Not Found"}, status: 404)
      expect { client.commit_sha("nevinera/delve-content", "tags/nope") }.to raise_error(Github::NotFoundError)
    end
  end

  describe "#matching_refs" do
    it "returns the matching ref names" do
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/git/matching-refs/tags/demo/v")
        .to_return(status: 200, headers: {"Content-Type" => "application/json"},
          body: [{ref: "refs/tags/demo/v1"}, {ref: "refs/tags/demo/v2"}].to_json)

      refs = described_class.new("gho_x").matching_refs("nevinera/delve-content", "tags/demo/v")
      expect(refs).to eq(["refs/tags/demo/v1", "refs/tags/demo/v2"])
    end
  end

  describe "#create_tag_ref" do
    let(:url) { "https://api.github.com/repos/nevinera/delve-content/git/refs" }

    it "creates a lightweight tag ref at the given sha" do
      stub = stub_request(:post, url)
        .with(body: {ref: "refs/tags/demo/v1", sha: "c0ffee"}.to_json, headers: {"Authorization" => "Bearer gho_x"})
        .to_return(status: 201, headers: {"Content-Type" => "application/json"}, body: {ref: "refs/tags/demo/v1"}.to_json)

      described_class.new("gho_x").create_tag_ref("nevinera/delve-content", "demo/v1", "c0ffee")
      expect(stub).to have_been_requested
    end

    it "falls back to the HTTP status message when the error body isn't JSON" do
      stub_request(:post, url).to_return(status: [502, "Bad Gateway"], body: "<html>oops</html>")

      expect { described_class.new("gho_x").create_tag_ref("nevinera/delve-content", "demo/v1", "c0ffee") }
        .to raise_error(Github::ApiError, /502.*Bad Gateway/)
    end

    it "raises ApiError with GitHub's message when the ref already exists" do
      stub_request(:post, url)
        .to_return(status: 422, headers: {"Content-Type" => "application/json"}, body: {message: "Reference already exists"}.to_json)

      expect { described_class.new("gho_x").create_tag_ref("nevinera/delve-content", "demo/v1", "c0ffee") }
        .to raise_error(Github::ApiError, /Reference already exists/)
    end
  end
end
