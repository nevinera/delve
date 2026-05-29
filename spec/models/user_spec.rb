require "rails_helper"

RSpec.describe User, type: :model do
  describe "handle validation" do
    it "is valid with no handle" do
      expect(build(:user, handle: nil)).to be_valid
    end

    it "is valid with a conforming handle" do
      expect(build(:user, handle: "nevinera")).to be_valid
    end

    it "requires at least 6 characters" do
      expect(build(:user, handle: "abc")).not_to be_valid
    end

    it "rejects uppercase letters" do
      expect(build(:user, handle: "Nevinera")).not_to be_valid
    end

    it "rejects spaces" do
      expect(build(:user, handle: "nev inera")).not_to be_valid
    end

    it "rejects hyphens" do
      expect(build(:user, handle: "nev-inera")).not_to be_valid
    end

    it "allows underscores" do
      expect(build(:user, handle: "nev_inera")).to be_valid
    end

    it "allows digits" do
      expect(build(:user, handle: "nevin3ra")).to be_valid
    end

    it "enforces uniqueness" do
      create(:user, handle: "nevinera")
      expect(build(:user, handle: "nevinera")).not_to be_valid
    end
  end

  describe ".from_omniauth" do
    let(:auth) do
      OmniAuth::AuthHash.new(
        provider: "google_oauth2",
        uid: "12345",
        info: {email: "jane@example.com", name: "Jane Doe"}
      )
    end

    context "when the user does not exist" do
      it "creates a new user" do
        expect { User.from_omniauth(auth) }.to change(User, :count).by(1)
      end

      it "sets email, name, provider, and uid from the auth hash" do
        user = User.from_omniauth(auth)
        expect(user.email).to eq("jane@example.com")
        expect(user.name).to eq("Jane Doe")
        expect(user.provider).to eq("google_oauth2")
        expect(user.uid).to eq("12345")
      end
    end

    context "when the user already exists" do
      before { create(:user, provider: "google_oauth2", uid: "12345", email: "jane@example.com") }

      it "returns the existing user without creating a new one" do
        expect { User.from_omniauth(auth) }.not_to change(User, :count)
      end

      it "returns the correct user" do
        user = User.from_omniauth(auth)
        expect(user.uid).to eq("12345")
        expect(user.provider).to eq("google_oauth2")
      end
    end
  end
end
