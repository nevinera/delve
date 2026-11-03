require "rails_helper"

RSpec.describe "The class editor", type: :request do
  it "needs you to sign in" do
    get classes_path
    expect(response).to redirect_to(new_user_session_path)
  end

  it "shows its page" do
    sign_in create(:user)
    get classes_path
    expect(response).to have_http_status(:ok)
    expect(response.body).to include("newClass")
  end
end
