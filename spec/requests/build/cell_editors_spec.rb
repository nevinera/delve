require "rails_helper"

RSpec.describe "Build::CellEditors", type: :request do
  it "redirects to login when not logged in" do
    get "/build/cell_editor"
    expect(response).to redirect_to("/login")
  end

  it "serves the editor's mount point" do
    sign_in create(:user)
    get "/build/cell_editor"
    expect(response).to have_http_status(:ok)
    expect(response.body).to include('id="editor-root"')
  end
end
