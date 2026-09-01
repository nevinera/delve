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
end
