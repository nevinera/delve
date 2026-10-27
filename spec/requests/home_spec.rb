require "rails_helper"

RSpec.describe "Home", type: :request do
  it "shows the name, the screenshot and a link to the editor" do
    get root_path

    expect(response).to have_http_status(:ok)
    expect(response.body).to include("<h1>Delve</h1>")
    expect(response.body).to match(/screenshot-\h+\.png/)
    expect(response.body).to include(%(href="/editor"))
  end

  it "offers Google sign-in when signed out" do
    get root_path
    expect(response.body).to include("Sign in with Google")
  end

  it "shows who is signed in and a sign-out button" do
    sign_in create(:user, email: "me@example.com")
    get root_path
    expect(response.body).to include("Signed in as me@example.com")
    expect(response.body).to include("Sign out")
  end
end
