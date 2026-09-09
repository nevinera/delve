require "rails_helper"

RSpec.describe "Github::Connections", type: :request do
  let(:user) { create(:user) }

  def stub_token_exchange(grant_type:, access_token: "gho_newtoken", refresh_token: "ghr_newrefresh")
    stub_request(:post, "https://github.com/login/oauth/access_token")
      .with(body: hash_including("grant_type" => grant_type))
      .to_return(
        status: 200,
        headers: {"Content-Type" => "application/json"},
        body: {
          access_token: access_token,
          refresh_token: refresh_token,
          expires_in: 28_800,
          refresh_token_expires_in: 15_811_200,
          token_type: "bearer"
        }.to_json
      )
  end

  def stub_github_user(login: "octocat")
    stub_request(:get, "https://api.github.com/user")
      .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {login: login}.to_json)
  end

  def stub_installations(installation_ids)
    stub_request(:get, "https://api.github.com/user/installations")
      .to_return(
        status: 200,
        headers: {"Content-Type" => "application/json"},
        body: {installations: installation_ids.map { |id| {id: id} }}.to_json
      )
  end

  def stub_installation_repositories(installation_id, repo_full_name: "nevinera/delve-content")
    stub_request(:get, "https://api.github.com/user/installations/#{installation_id}/repositories")
      .to_return(
        status: 200,
        headers: {"Content-Type" => "application/json"},
        body: {repositories: [{full_name: repo_full_name}]}.to_json
      )
  end

  def stub_installation_repositories_multiple(installation_id, repo_full_names:)
    stub_request(:get, "https://api.github.com/user/installations/#{installation_id}/repositories")
      .to_return(
        status: 200,
        headers: {"Content-Type" => "application/json"},
        body: {repositories: repo_full_names.map { |name| {full_name: name} }}.to_json
      )
  end

  context "when not logged in" do
    it "redirects connect to login" do
      get "/github/connect"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    describe "GET /github/connect" do
      it "returns 200 with the create-template, install, and authorize links" do
        get "/github/connect"
        expect(response).to have_http_status(:ok)
        expect(response.body).to include("github.com/new?template_owner=nevinera&amp;template_name=delve-content-template")
        expect(response.body).to include("installations/new?state=")
        expect(response.body).to include("github.com/login/oauth/authorize")
      end
    end

    describe "GET /github/reauth" do
      it "redirects to GitHub's authorize URL with a state param" do
        get "/github/reauth"
        expect(response).to have_http_status(:found)
        expect(response.location).to start_with("https://github.com/login/oauth/authorize")
        expect(response.location).to include("state=")
      end
    end

    describe "GET /github/callback" do
      context "with a mismatched state" do
        it "redirects to connect with an alert" do
          get "/github/connect"
          get "/github/callback", params: {code: "abc", state: "wrong"}
          expect(response).to redirect_to(github_connect_path)
          follow_redirect!
          expect(response.body).to include("invalid state")
        end
      end

      context "when the account is not on the github allow-list" do
        before do
          get "/github/connect"
          @state = session[:github_oauth_state]
          stub_token_exchange(grant_type: "authorization_code")
          stub_github_user(login: "blocked-user")
          allow(AllowOnlyList).to receive(:allows?).with("github", "blocked-user").and_return(false)
        end

        it "does not persist an installation and redirects to connect with an alert" do
          expect {
            get "/github/callback", params: {code: "abc", state: @state}
          }.not_to change(GithubInstallation, :count)

          expect(response).to redirect_to(github_connect_path)
          follow_redirect!
          expect(response.body).to include("not permitted")
        end
      end

      context "when the account has exactly one installation" do
        it "creates a GithubInstallation and redirects to the build dashboard" do
          get "/github/connect"
          state = session[:github_oauth_state]

          stub_token_exchange(grant_type: "authorization_code")
          stub_github_user
          stub_installations([555])
          stub_installation_repositories(555)

          expect {
            get "/github/callback", params: {code: "abc", state: state}
          }.to change(GithubInstallation, :count).by(1)

          expect(response).to redirect_to(build_root_path)
          installation = user.reload.github_installation
          expect(installation.installation_id).to eq(555)
          expect(installation.repo_full_name).to eq("nevinera/delve-content")
          expect(installation.access_token).to eq("gho_newtoken")
        end
      end

      context "when the installation has no repositories selected" do
        it "does not persist an installation and tells them to create the repo from the template first" do
          get "/github/connect"
          state = session[:github_oauth_state]

          stub_token_exchange(grant_type: "authorization_code")
          stub_github_user
          stub_installations([555])
          stub_installation_repositories_multiple(555, repo_full_names: [])

          expect {
            get "/github/callback", params: {code: "abc", state: state}
          }.not_to change(GithubInstallation, :count)

          expect(response).to redirect_to(github_connect_path)
          follow_redirect!
          expect(response.body).to include("create your content repository from the template first")
        end
      end

      context "when the installation has more than one repository selected" do
        it "does not persist an installation and redirects to connect with an alert" do
          get "/github/connect"
          state = session[:github_oauth_state]

          stub_token_exchange(grant_type: "authorization_code")
          stub_github_user
          stub_installations([555])
          stub_installation_repositories_multiple(555, repo_full_names: ["nevinera/delve-content", "nevinera/other-repo"])

          expect {
            get "/github/callback", params: {code: "abc", state: state}
          }.not_to change(GithubInstallation, :count)

          expect(response).to redirect_to(github_connect_path)
          follow_redirect!
          expect(response.body).to include("more than one repository")
          expect(user.reload.github_installation).to be_nil
        end
      end

      context "when the account has no installation" do
        it "does not persist an installation and tells them to install the app first" do
          get "/github/connect"
          state = session[:github_oauth_state]

          stub_token_exchange(grant_type: "authorization_code")
          stub_github_user
          stub_installations([])

          expect {
            get "/github/callback", params: {code: "abc", state: state}
          }.not_to change(GithubInstallation, :count)

          expect(response).to redirect_to(github_connect_path)
          follow_redirect!
          expect(response.body).to include("Install the app on your content repo first")
        end
      end

      context "when the account has more than one installation" do
        it "does not persist an installation and tells them to remove the extras" do
          get "/github/connect"
          state = session[:github_oauth_state]

          stub_token_exchange(grant_type: "authorization_code")
          stub_github_user
          stub_installations([555, 556])

          expect {
            get "/github/callback", params: {code: "abc", state: state}
          }.not_to change(GithubInstallation, :count)

          expect(response).to redirect_to(github_connect_path)
          follow_redirect!
          expect(response.body).to include("more than one repository - remove the extra installation(s)")
        end
      end

      context "when reauthorizing an existing connection" do
        let!(:installation) { create(:github_installation, user: user, installation_id: 555, access_token: "gho_stale") }

        it "updates the existing installation's tokens without changing the installation" do
          get "/github/connect"
          state = session[:github_oauth_state]

          stub_token_exchange(grant_type: "authorization_code", access_token: "gho_refreshed")
          stub_github_user
          stub_installations([555])
          stub_installation_repositories(555)

          get "/github/callback", params: {code: "abc", state: state}

          expect(response).to redirect_to(build_root_path)
          expect(installation.reload.access_token).to eq("gho_refreshed")
          expect(installation.installation_id).to eq(555)
          expect(installation.repo_full_name).to eq("nevinera/delve-content")
        end
      end
    end

    describe "GET /github/manage" do
      context "with no existing connection" do
        it "redirects to connect" do
          get "/github/manage"
          expect(response).to redirect_to(github_connect_path)
        end
      end

      context "with an existing connection" do
        before { create(:github_installation, user: user, repo_full_name: "nevinera/delve-content") }

        it "returns 200 and explains changing the repo, uninstalling, and disconnecting" do
          get "/github/manage"
          expect(response).to have_http_status(:ok)
          expect(response.body).to include("nevinera/delve-content")
          expect(response.body).to include("installations/new?state=")
          expect(response.body).to include("github.com/settings/installations")
          expect(response.body).to include(github_disconnect_path)
        end
      end
    end

    describe "DELETE /github/disconnect" do
      context "with an existing connection" do
        let!(:installation) { create(:github_installation, user: user, access_token: "gho_current") }

        it "revokes the grant, destroys the installation, and redirects to connect" do
          revoke_stub = stub_request(:delete, "https://api.github.com/applications/test_github_client_id/grant")
            .with(body: {access_token: "gho_current"}.to_json)
            .to_return(status: 204)

          expect {
            delete "/github/disconnect"
          }.to change(GithubInstallation, :count).by(-1)

          expect(revoke_stub).to have_been_requested
          expect(response).to redirect_to(github_connect_path)
          expect(user.reload.github_installation).to be_nil
        end
      end

      context "with no existing connection" do
        it "redirects to connect without error" do
          delete "/github/disconnect"
          expect(response).to redirect_to(github_connect_path)
        end
      end
    end

    describe "GET /github/token" do
      context "when there is no connection" do
        it "returns 401 with a connect_url" do
          get "/github/token"
          expect(response).to have_http_status(:unauthorized)
          expect(JSON.parse(response.body)["error"]).to eq("not_connected")
        end
      end

      context "when the access token is still fresh" do
        let!(:installation) do
          create(:github_installation, user: user, access_token: "gho_fresh", access_token_expires_at: 1.hour.from_now)
        end

        it "returns the token without refreshing" do
          get "/github/token"
          expect(response).to have_http_status(:ok)
          body = JSON.parse(response.body)
          expect(body["token"]).to eq("gho_fresh")
          expect(body["repo_full_name"]).to eq(installation.repo_full_name)
        end
      end

      context "when the access token is expired but the refresh token is valid" do
        let!(:installation) do
          create(:github_installation, user: user, access_token: "gho_expired", access_token_expires_at: 1.hour.ago)
        end

        it "refreshes and returns the new token" do
          stub_token_exchange(grant_type: "refresh_token", access_token: "gho_refreshed")

          get "/github/token"

          expect(response).to have_http_status(:ok)
          expect(JSON.parse(response.body)["token"]).to eq("gho_refreshed")
          expect(installation.reload.access_token).to eq("gho_refreshed")
        end
      end

      context "when the refresh token has also expired" do
        let!(:installation) do
          create(:github_installation, user: user, refresh_token_expires_at: 1.day.ago)
        end

        it "returns 401 with a reauth_url" do
          get "/github/token"
          expect(response).to have_http_status(:unauthorized)
          expect(JSON.parse(response.body)["error"]).to eq("reauth_required")
        end
      end
    end
  end
end
