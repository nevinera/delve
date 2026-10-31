require "rails_helper"

RSpec.describe "Home", type: :request do
  it "shows the name and a sign-in link when signed out" do
    get root_path

    expect(response).to have_http_status(:ok)
    expect(response.body).to include("<h1>Delve</h1>")
    expect(response.body).to include(%(href="/login"))
    expect(response.body).not_to include(%(href="/create"))
  end

  it "sends you to /home when signed in" do
    sign_in create(:user)
    get root_path
    expect(response).to redirect_to(home_path)
  end
end
