require "rails_helper"

RSpec.describe Ability, type: :model do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:ability) { Ability.new(user) }

  let(:own_handle) { create(:handle, user: user) }
  let(:other_handle) { create(:handle, user: other_user) }

  describe "Zone" do
    let(:own_zone) { create(:zone, handle: own_handle, registering_user: user) }
    let(:other_zone) { create(:zone, handle: other_handle, registering_user: other_user) }

    it "can manage a zone whose handle belongs to the user" do
      expect(ability).to be_able_to(:manage, own_zone)
    end

    it "cannot manage a zone whose handle belongs to another user" do
      expect(ability).not_to be_able_to(:manage, other_zone)
    end

    it "can read any zone" do
      expect(ability).to be_able_to(:read, other_zone)
    end
  end

  describe "Handle" do
    it "can manage own handles" do
      expect(ability).to be_able_to(:manage, own_handle)
    end

    it "cannot manage another user's handle" do
      expect(ability).not_to be_able_to(:manage, other_handle)
    end

    it "can read any handle" do
      expect(ability).to be_able_to(:read, other_handle)
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
