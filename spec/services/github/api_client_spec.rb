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

  describe "#raw_repository_contents" do
    it "requests the raw media type and returns the response as-is (no JSON parsing)" do
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/gc1-entrance/gc1-entrance.webp")
        .with(headers: {"Authorization" => "Bearer gho_x", "Accept" => "application/vnd.github.raw+json"})
        .to_return(status: 200, headers: {"Content-Type" => "image/webp"}, body: "fake-webp-bytes")

      response = described_class.new("gho_x").raw_repository_contents("nevinera/delve-content", "zones/goblin-cave/gc1-entrance/gc1-entrance.webp")
      expect(response).to be_a(Net::HTTPSuccess)
      expect(response.body).to eq("fake-webp-bytes")
    end
  end
end
