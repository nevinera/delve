require "rails_helper"

RSpec.describe "Create", type: :request do
  before { sign_in create(:user) }

  it "shows the view and a way to open a world" do
    get create_path

    expect(response).to have_http_status(:ok)
    expect(response.body).to include('<canvas id="view"', 'id="openFile"')
  end
end
