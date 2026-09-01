require "rails_helper"

RSpec.describe GithubInstallation, type: :model do
  describe "validations" do
    it "is valid with all required fields" do
      expect(build(:github_installation)).to be_valid
    end

    it "requires an installation_id" do
      expect(build(:github_installation, installation_id: nil)).not_to be_valid
    end

    it "enforces uniqueness of installation_id" do
      create(:github_installation, installation_id: 123)
      expect(build(:github_installation, installation_id: 123)).not_to be_valid
    end

    it "requires a repo_full_name" do
      expect(build(:github_installation, repo_full_name: nil)).not_to be_valid
    end

    it "requires an access_token" do
      expect(build(:github_installation, access_token: nil)).not_to be_valid
    end

    it "requires a refresh_token" do
      expect(build(:github_installation, refresh_token: nil)).not_to be_valid
    end

    it "allows only one installation per user" do
      user = create(:user)
      create(:github_installation, user: user)
      expect(build(:github_installation, user: user)).not_to be_valid
    end
  end

  describe "#access_token_expired?" do
    it "is false when the access token is still fresh" do
      installation = build(:github_installation, access_token_expires_at: 1.hour.from_now)
      expect(installation.access_token_expired?).to be false
    end

    it "is true when the access token has expired" do
      installation = build(:github_installation, access_token_expires_at: 1.hour.ago)
      expect(installation.access_token_expired?).to be true
    end
  end

  describe "#refresh_token_expired?" do
    it "is false when the refresh token is still fresh" do
      installation = build(:github_installation, refresh_token_expires_at: 1.month.from_now)
      expect(installation.refresh_token_expired?).to be false
    end

    it "is true when the refresh token has expired" do
      installation = build(:github_installation, refresh_token_expires_at: 1.month.ago)
      expect(installation.refresh_token_expired?).to be true
    end
  end

  describe "encryption" do
    it "stores the access token encrypted at rest" do
      installation = create(:github_installation, access_token: "gho_supersecret")
      raw = ActiveRecord::Base.connection.select_value(
        "SELECT access_token FROM github_installations WHERE id = #{installation.id}"
      )
      expect(raw).not_to include("gho_supersecret")
    end
  end
end
