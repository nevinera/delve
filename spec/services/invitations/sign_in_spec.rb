require "rails_helper"

RSpec.describe Invitations::SignIn do
  let(:auth) { google_auth_hash(uid: "new_uid", email: "new@example.com") }

  it "makes the account and uses the invitation together" do
    invitation = Invitation.create!
    result = described_class.call(auth, invitation_token: invitation.token)
    expect([result.error, result.user.email, invitation.reload.used_by]).to eq([nil, "new@example.com", result.user])
  end

  it "makes no account when the invitation is used by the time it's taken" do
    invitation = Invitation.create!
    allow_any_instance_of(Invitation).to receive(:use!).and_return(false)
    result = described_class.call(auth, invitation_token: invitation.token)
    expect([result.user, result.error, User.count]).to eq([nil, "That invitation has been used.", 0])
  end
end
