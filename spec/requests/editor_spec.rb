require "rails_helper"

RSpec.describe "Editor", type: :request do
  before { sign_in create(:user) }

  it "shows the map and the download button" do
    get editor_path

    expect(response).to have_http_status(:ok)
    expect(response.body).to include('<canvas id="map"')
    expect(response.body).to include("download world")
  end
end
