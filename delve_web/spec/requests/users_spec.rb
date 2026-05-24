require "rails_helper"

RSpec.describe "Users", type: :request do
  describe "GET /" do
    context "when not logged in" do
      it "redirects to login" do
        get "/"
        expect(response).to redirect_to("/login")
      end
    end

    context "when logged in" do
      let!(:users) { create_list(:user, 3) }

      before { sign_in users.first }

      it "returns 200" do
        get "/"
        expect(response).to have_http_status(:ok)
      end

      it "lists all users" do
        get "/"
        users.each { |u| expect(response.body).to include(u.email) }
      end

      it "renders users in id order" do
        get "/"
        positions = users.sort_by(&:id).map { |u| response.body.index(u.email) }
        expect(positions).to eq(positions.sort)
      end
    end
  end
end
