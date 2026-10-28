require "rails_helper"

RSpec.describe "Dashboard", type: :request do
  let(:user) { create(:user) }

  before { sign_in user }

  it "needs you signed in" do
    sign_out user
    get home_path
    expect(response).to redirect_to(new_user_session_path)
  end

  it "lists your three latest characters, with a link to them all" do
    %w[Ada Bree Cass Dov].each_with_index { |name, i| create(:character, user: user, name: name, updated_at: i.days.ago) }
    get home_path

    expect(response.body).to include("Ada", "Bree", "Cass")
    expect(response.body).not_to include("Dov")
    expect(response.body).to include("All 4 characters")
  end

  it "asks you to connect GitHub before showing worlds" do
    get home_path
    expect(response.body).to include("Connect GitHub")
    expect(response.body).not_to include(%(class="world-list"))
  end

  it "lists your worlds once GitHub is connected" do
    create(:github_connection, user: user)
    get home_path
    expect(response.body).to include(%(class="world-list"))
    expect(response.body).to include(%(href="/editor"))
  end
end
