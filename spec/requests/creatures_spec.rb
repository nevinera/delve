require "rails_helper"

RSpec.describe "Creatures", type: :request do
  let(:user) { create(:user) }

  before { sign_in user }

  it "needs you signed in" do
    sign_out user
    get creatures_path
    expect(response).to redirect_to(new_user_session_path)
  end

  it "shows the creatures" do
    get creatures_path

    expect(response).to have_http_status(:ok)
    expect(response.body).to include("Creatures", "new looks")
  end

  it "shows one creature" do
    get creature_path

    expect(response).to have_http_status(:ok)
    expect(response.body).to include("Creature", "new look", "controls")
  end
end
