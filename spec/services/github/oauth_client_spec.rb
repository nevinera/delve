require "rails_helper"

RSpec.describe Github::OauthClient do
  describe ".exchange_code" do
    it "posts an authorization_code grant and returns the parsed token response" do
      stub_request(:post, "https://github.com/login/oauth/access_token")
        .with(body: hash_including("grant_type" => "authorization_code", "code" => "abc123"))
        .to_return(
          status: 200,
          headers: {"Content-Type" => "application/json"},
          body: {access_token: "gho_x", refresh_token: "ghr_x", expires_in: 100, refresh_token_expires_in: 200}.to_json
        )

      result = described_class.exchange_code("abc123")
      expect(result["access_token"]).to eq("gho_x")
      expect(result["refresh_token"]).to eq("ghr_x")
    end

    it "raises Github::OauthError when GitHub returns an error" do
      stub_request(:post, "https://github.com/login/oauth/access_token")
        .to_return(
          status: 200,
          headers: {"Content-Type" => "application/json"},
          body: {error: "bad_verification_code", error_description: "The code passed is incorrect or expired."}.to_json
        )

      expect { described_class.exchange_code("bad") }
        .to raise_error(Github::OauthError, "The code passed is incorrect or expired.")
    end
  end

  describe ".refresh" do
    it "posts a refresh_token grant" do
      stub_request(:post, "https://github.com/login/oauth/access_token")
        .with(body: hash_including("grant_type" => "refresh_token", "refresh_token" => "ghr_old"))
        .to_return(
          status: 200,
          headers: {"Content-Type" => "application/json"},
          body: {access_token: "gho_new", refresh_token: "ghr_new", expires_in: 100, refresh_token_expires_in: 200}.to_json
        )

      result = described_class.refresh("ghr_old")
      expect(result["access_token"]).to eq("gho_new")
    end
  end
end
