require "rails_helper"

RSpec.describe "Character builder", type: :request do
  it "shows the stage and the controls" do
    get character_builder_path

    expect(response).to have_http_status(:ok)
    expect(response.body).to include('<canvas id="stage"')
    expect(response.body).to include("copy recipe")
  end
end
