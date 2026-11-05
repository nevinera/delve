require "rails_helper"

RSpec.describe "Admin", type: :request do
  let(:user) { create(:user, role: "system_admin") }

  before { sign_in user }

  it "needs you signed in" do
    sign_out user
    get admin_path
    expect(response).to redirect_to(new_user_session_path)
  end

  it "is only for system admins, and only they see it linked from the home page" do
    user.update!(role: nil)
    get admin_path
    expect(response).to have_http_status(:not_found)
    get home_path
    expect(response.body).not_to include(admin_path)
  end

  it "links the labs, reports and errors, and the home page links it" do
    get admin_path

    expect(response).to have_http_status(:ok)
    expect(response.body).to include(problem_reports_path, client_errors_path, animation_lab_path, monster_lab_path, creatures_path, creature_path)
    get home_path
    expect(response.body).to include(admin_path)
  end
end
