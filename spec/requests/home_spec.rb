require "rails_helper"

RSpec.describe "Home", type: :request do
  it "shows the name, the screenshot and a link to the editor" do
    get root_path

    expect(response).to have_http_status(:ok)
    expect(response.body).to include("<h1>Delve</h1>")
    expect(response.body).to match(/screenshot-\h+\.png/)
    expect(response.body).to include(%(href="/editor"))
  end
end
