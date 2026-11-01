require "rails_helper"

RSpec.describe "Monster lab", type: :request do
  let(:user) { create(:user) }

  before { sign_in user }

  it "needs you signed in" do
    sign_out user
    get monster_lab_path
    expect(response).to redirect_to(new_user_session_path)
  end

  it "shows the lab" do
    get monster_lab_path

    expect(response).to have_http_status(:ok)
    expect(response.body).to include("Monster lab", "new looks", "bodies")
  end
end
