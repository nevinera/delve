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

    it "recurses into subdirectories, returning only file entries" do
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities")
        .to_return(
          status: 200,
          headers: {"Content-Type" => "application/json"},
          body: [
            {name: "punch.json", path: "abilities/punch.json", type: "file"},
            {name: "classes", path: "abilities/classes", type: "dir"}
          ].to_json
        )
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/classes")
        .to_return(
          status: 200,
          headers: {"Content-Type" => "application/json"},
          body: [{name: "druid", path: "abilities/classes/druid", type: "dir"}].to_json
        )
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities/classes/druid")
        .to_return(
          status: 200,
          headers: {"Content-Type" => "application/json"},
          body: [{name: "wildshape.json", path: "abilities/classes/druid/wildshape.json", type: "file"}].to_json
        )

      result = described_class.new(user).list_directory_recursive("abilities")
      expect(result.map { |e| e["path"] }).to contain_exactly(
        "abilities/punch.json", "abilities/classes/druid/wildshape.json"
      )
    end

    it "returns an empty array for an empty directory" do
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/abilities")
        .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: [].to_json)

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

  describe "#raw_file_content" do
    let!(:installation) do
      create(:github_installation, user: user, repo_full_name: "nevinera/delve-content",
        access_token: "gho_fresh", access_token_expires_at: 1.hour.from_now)
    end

    it "returns the exact bytes GitHub sends back for the raw media type, with no base64/JSON envelope" do
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/goblin-cave/gc1-entrance/gc1-entrance.webp")
        .with(headers: {"Authorization" => "Bearer gho_fresh", "Accept" => "application/vnd.github.raw+json"})
        .to_return(status: 200, headers: {"Content-Type" => "image/webp"}, body: "fake-webp-bytes")

      result = described_class.new(user).raw_file_content("zones/goblin-cave/gc1-entrance/gc1-entrance.webp")
      expect(result).to eq("fake-webp-bytes")
    end

    it "raises NotFoundError when GitHub returns a 404 for the path" do
      stub_request(:get, "https://api.github.com/repos/nevinera/delve-content/contents/zones/missing.webp")
        .to_return(status: 404, headers: {"Content-Type" => "application/json"}, body: {message: "Not Found"}.to_json)

      expect { described_class.new(user).raw_file_content("zones/missing.webp") }.to raise_error(Github::NotFoundError)
    end
  end
end
