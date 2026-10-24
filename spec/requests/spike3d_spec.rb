require "rails_helper"

RSpec.describe "Spike3d", type: :request do
  it "serves the spike page to a signed-in user" do
    sign_in create(:user)

    get "/spike3d"

    expect(response).to have_http_status(:ok)
    expect(response.body).to include('id="spike3d"')
  end

  it "requires sign-in" do
    get "/spike3d"

    expect(response).to redirect_to("/login")
  end
end
