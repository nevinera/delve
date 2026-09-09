require "rails_helper"

RSpec.describe "Admin::Users", type: :request do
  describe "GET /admin/users" do
    context "when not logged in" do
      it "redirects to login" do
        get "/admin/users"
        expect(response).to redirect_to("/login")
      end
    end

    context "when logged in as a non-admin" do
      before { sign_in create(:user) }

      it "redirects to root with an alert" do
        get "/admin/users"
        expect(response).to redirect_to(root_path)
        follow_redirect!
        expect(response.body).to include("not permitted")
      end
    end

    context "when logged in as an admin" do
      let!(:users) { create_list(:user, 3) }

      before { sign_in create(:user, :admin) }

      it "returns 200" do
        get "/admin/users"
        expect(response).to have_http_status(:ok)
      end

      it "lists all users" do
        get "/admin/users"
        users.each { |u| expect(response.body).to include(u.email) }
      end

      it "renders users in id order" do
        get "/admin/users"
        positions = users.sort_by(&:id).map { |u| response.body.index(u.email) }
        expect(positions).to eq(positions.sort)
      end
    end
  end
end
