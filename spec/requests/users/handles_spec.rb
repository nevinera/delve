require "rails_helper"

RSpec.describe "Users::Handles", type: :request do
  let(:user) { create(:user) }
  let!(:handle) { create(:handle, user: user, identifier: "nevinera") }

  context "when not logged in" do
    it "redirects index to login" do
      get "/users/#{user.id}/handles"
      expect(response).to redirect_to("/login")
    end

    it "redirects show to login" do
      get "/users/#{user.id}/handles/#{handle.id}"
      expect(response).to redirect_to("/login")
    end

    it "redirects new to login" do
      get "/users/#{user.id}/handles/new"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    describe "GET /users/:user_id/handles" do
      it "returns 200" do
        get "/users/#{user.id}/handles"
        expect(response).to have_http_status(:ok)
      end

      it "lists the user's handles" do
        get "/users/#{user.id}/handles"
        expect(response.body).to include("nevinera")
      end
    end

    describe "GET /users/:user_id/handles/:id" do
      it "returns 200" do
        get "/users/#{user.id}/handles/#{handle.id}"
        expect(response).to have_http_status(:ok)
      end

      it "shows the identifier" do
        get "/users/#{user.id}/handles/#{handle.id}"
        expect(response.body).to include("nevinera")
      end
    end

    describe "GET /users/:user_id/handles/new" do
      it "returns 200" do
        get "/users/#{user.id}/handles/new"
        expect(response).to have_http_status(:ok)
      end
    end

    describe "POST /users/:user_id/handles" do
      context "with valid params" do
        it "creates a handle and redirects to show" do
          expect {
            post "/users/#{user.id}/handles", params: {handle: {identifier: "mynewhandle"}}
          }.to change(Handle, :count).by(1)
          expect(response).to redirect_to(user_handle_path(user, Handle.last))
        end
      end

      context "with an invalid identifier" do
        it "re-renders new with an error" do
          post "/users/#{user.id}/handles", params: {handle: {identifier: "bad"}}
          expect(response).to have_http_status(:unprocessable_entity)
          expect(response.body).to include("at least 6 characters")
        end
      end

      context "with a duplicate identifier" do
        it "re-renders new with an error" do
          post "/users/#{user.id}/handles", params: {handle: {identifier: "nevinera"}}
          expect(response).to have_http_status(:unprocessable_entity)
          expect(response.body).to include("already been taken")
        end
      end
    end
  end
end
