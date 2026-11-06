require "rails_helper"

RSpec.describe "Invitations", type: :request do
  let(:admin) { create(:user, role: "system_admin") }

  it "shows an unused invitation's page to someone signed out" do
    invitation = Invitation.create!
    get invitation_path(invitation.token)
    expect(response).to have_http_status(:ok)
    expect(response.body).to include("You're invited", "Sign in with Google")
  end

  it "says a used or unknown invitation can't be used" do
    invitation = Invitation.create!
    invitation.use!(create(:user))
    get invitation_path(invitation.token)
    expect(response).to have_http_status(:not_found)
    expect(response.body).to include("This invitation can")
    get invitation_path("nope")
    expect(response).to have_http_status(:not_found)
  end

  it "lets system admins list and make invitations, from the admin page" do
    sign_in admin
    get admin_path
    expect(response.body).to include(admin_invitations_path)

    expect { post admin_invitations_path, params: {note: "for Sam"} }.to change(Invitation, :count).by(1)
    invitation = Invitation.last
    expect([invitation.note, invitation.created_by]).to eq(["for Sam", admin])
    follow_redirect!
    expect(response.body).to include("for Sam", invitation_url(invitation.token))
  end

  it "shows who used an invitation" do
    sign_in admin
    Invitation.create!(note: "used one").use!(create(:user, email: "sam@example.com"))
    get admin_invitations_path
    expect(response.body).to include("used by sam@example.com")
  end

  it "is only for system admins" do
    sign_in create(:user)
    get admin_invitations_path
    expect(response).to have_http_status(:not_found)
    post admin_invitations_path
    expect(response).to have_http_status(:not_found)
    expect(Invitation.count).to eq(0)
  end
end
