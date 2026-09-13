require "rails_helper"

RSpec.describe Ability, type: :model do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:ability) { Ability.new(user) }

  describe "Zone" do
    let(:own_zone) { create(:zone, registering_user: user) }
    let(:other_zone) { create(:zone, registering_user: other_user) }

    it "can manage a zone registered by the user" do
      expect(ability).to be_able_to(:manage, own_zone)
    end

    it "cannot manage a zone registered by another user" do
      expect(ability).not_to be_able_to(:manage, other_zone)
    end

    it "can read any zone" do
      expect(ability).to be_able_to(:read, other_zone)
    end
  end

  describe "admin" do
    let(:admin) { create(:user, admin: true) }
    let(:admin_ability) { Ability.new(admin) }

    it "can manage everything" do
      expect(admin_ability).to be_able_to(:manage, :all)
    end
  end
end
