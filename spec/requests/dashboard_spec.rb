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

  it "lists your three latest worlds once GitHub is connected, each linking to its versions" do
    create(:github_connection, user: user)
    create(:world, user:, repo: "me/old", opened_at: 1.week.ago)
    %w[a b c].each_with_index { |name, i| create(:world, user:, repo: "me/#{name}", opened_at: i.hours.ago) }
    get home_path
    expect(response.body).to include(%(href="#{world_path(World.find_by!(repo: "me/a"))}"))
    expect(response.body).not_to include("me/old")
    expect(response.body).to include(%(href="/worlds"))
  end
end
