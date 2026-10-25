require "rails_helper"

RSpec.describe "Home", type: :request do
  it "shows the name and the screenshot" do
    get root_path

    expect(response).to have_http_status(:ok)
    expect(response.body).to include("<h1>Delve</h1>")
    expect(response.body).to match(/screenshot-\h+\.png/)
  end
end
