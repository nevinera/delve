require "rails_helper"

RSpec.describe "Github::Connections", type: :request do
  let(:user) { create(:user) }

  def stub_token_exchange(grant_type:, access_token: "gho_newtoken")
    stub_request(:post, "https://github.com/login/oauth/access_token")
      .with(body: hash_including("grant_type" => grant_type))
      .to_return(
        status: 200,
        headers: {"Content-Type" => "application/json"},
        body: {access_token:, refresh_token: "ghr_newrefresh", expires_in: 28_800, refresh_token_expires_in: 15_811_200}.to_json
      )
  end

  def stub_github_user(login: "octocat")
    stub_request(:get, "https://api.github.com/user")
      .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {login:}.to_json)
  end

  def connect_state
    get "/github/connect"
    session[:github_oauth_state]
  end

  it "needs a signed-in user" do
    get "/github/connect"
    expect(response).to redirect_to("/login")
  end

  context "when signed in" do
    before { sign_in user }

    it "offers to install the app or connect to an installed one" do
      get "/github/connect"
      expect(response.body).to include("installations/new?state=")
      expect(response.body).to include("github.com/login/oauth/authorize")
    end

    it "shows the connected account" do
      create(:github_connection, user:, login: "someone")
      get "/github/connect"
      expect(response.body).to include("Connected as <strong>someone</strong>")
      expect(response.body).to include("Disconnect")
    end

    it "redirects reauth to GitHub's authorize page" do
      get "/github/reauth"
      expect(response.location).to start_with("https://github.com/login/oauth/authorize")
    end

    describe "the callback" do
      it "refuses a mismatched state" do
        connect_state
        get "/github/callback", params: {code: "abc", state: "wrong"}
        expect(response).to redirect_to(github_connect_path)
        expect(flash[:alert]).to include("invalid state")
      end

      it "saves the connection, whatever repos the app can see" do
        state = connect_state
        stub_token_exchange(grant_type: "authorization_code")
        stub_github_user(login: "someone")

        expect { get "/github/callback", params: {code: "abc", state:} }.to change(GithubConnection, :count).by(1)
        expect(response).to redirect_to(github_connect_path)
        expect(user.reload.github_connection).to have_attributes(login: "someone", access_token: "gho_newtoken")
      end

      it "updates an existing connection" do
        create(:github_connection, user:, access_token: "gho_old")
        state = connect_state
        stub_token_exchange(grant_type: "authorization_code")
        stub_github_user

        expect { get "/github/callback", params: {code: "abc", state:} }.not_to change(GithubConnection, :count)
        expect(user.reload.github_connection.access_token).to eq("gho_newtoken")
      end

      it "refuses an account that isn't on the github allowlist" do
        state = connect_state
        stub_token_exchange(grant_type: "authorization_code")
        stub_github_user(login: "blocked")
        allow(AllowOnlyList).to receive(:allows?).with("github", "blocked").and_return(false)

        expect { get "/github/callback", params: {code: "abc", state:} }.not_to change(GithubConnection, :count)
        expect(flash[:alert]).to include("not permitted")
      end

      it "reports a failed code exchange" do
        state = connect_state
        stub_request(:post, "https://github.com/login/oauth/access_token")
          .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {error: "bad_verification_code", error_description: "The code is wrong."}.to_json)

        get "/github/callback", params: {code: "abc", state:}
        expect(flash[:alert]).to eq("GitHub authorization failed: The code is wrong.")
      end
    end

    describe "the token" do
      it "says when GitHub isn't connected" do
        get "/github/token"
        expect(response).to have_http_status(:unauthorized)
        expect(response.parsed_body["error"]).to eq("not_connected")
      end

      it "hands back a current token" do
        create(:github_connection, user:, login: "someone")
        get "/github/token"
        expect(response.parsed_body).to include("token" => "gho_faketoken", "login" => "someone")
      end

      it "refreshes an expired token" do
        create(:github_connection, user:, access_token_expires_at: 1.minute.ago)
        stub_token_exchange(grant_type: "refresh_token", access_token: "gho_refreshed")
        get "/github/token"
        expect(response.parsed_body["token"]).to eq("gho_refreshed")
      end

      it "asks to reauthorize when the refresh token has expired" do
        create(:github_connection, user:, access_token_expires_at: 1.minute.ago, refresh_token_expires_at: 1.minute.ago)
        get "/github/token"
        expect(response.parsed_body["error"]).to eq("reauth_required")
      end
    end

    it "disconnects, revoking the grant" do
      create(:github_connection, user:)
      revoke = stub_request(:delete, %r{api.github.com/applications/.*/grant})
      delete "/github/disconnect"
      expect(revoke).to have_been_requested
      expect(user.reload.github_connection).to be_nil
    end
  end
end
