require "rails_helper"

RSpec.describe User do
  it "has no role to begin with" do
    expect(build(:user)).not_to be_system_admin
  end

  it "can be a system admin" do
    expect(build(:user, role: "system_admin")).to be_system_admin
  end

  it "takes no other role" do
    expect(build(:user, role: "emperor")).not_to be_valid
  end
end
