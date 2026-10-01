require "rails_helper"

RSpec.describe Ability, type: :model do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:ability) { Ability.new(user) }

  describe "Zone" do
    it "can read any zone" do
      expect(ability).to be_able_to(:read, create(:zone))
    end

    it "cannot manage a zone" do
      expect(ability).not_to be_able_to(:manage, create(:zone))
    end
  end

  describe "World" do
    let(:own_world) { create(:world, owner: user) }
    let(:other_world) { create(:world, owner: other_user) }

    it "can manage a world the user owns" do
      expect(ability).to be_able_to(:manage, own_world)
    end

    it "cannot manage another user's world" do
      expect(ability).not_to be_able_to(:manage, other_world)
    end

    it "can manage versions of a world the user owns" do
      expect(ability).to be_able_to(:manage, create(:world_version, world: own_world))
    end

    it "cannot manage versions of another user's world" do
      expect(ability).not_to be_able_to(:manage, create(:world_version, world: other_world))
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
