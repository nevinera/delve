require "rails_helper"

RSpec.describe "Animation lab", type: :request do
  let(:user) { create(:user, role: "system_admin") }

  before { sign_in user }

  it "is only for system admins" do
    user.update!(role: nil)
    get animation_lab_path
    expect(response).to have_http_status(:not_found)
  end

  it "needs you signed in" do
    sign_out user
    get animation_lab_path
    expect(response).to redirect_to(new_user_session_path)
  end

  it "offers your characters to animate" do
    create(:character, user: user, name: "Ada")
    get animation_lab_path

    expect(response).to have_http_status(:ok)
    expect(response.body).to include("Animation lab", "Ada")
  end
end
