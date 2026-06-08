require "rails_helper"

RSpec.describe "Build::CharacterClasses", type: :request do
  let(:user) { create(:user) }
  let(:handle) { create(:handle, user: user) }
  let!(:character_class) { create(:character_class, user: user, handle: handle, identifier: "puncher") }

  context "when not logged in" do
    it "redirects index to login" do
      get "/build/character_classes"
      expect(response).to redirect_to("/login")
    end

    it "redirects show to login" do
      get "/build/character_classes/#{character_class.id}"
      expect(response).to redirect_to("/login")
    end

    it "redirects new to login" do
      get "/build/character_classes/new"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    describe "GET /build/character_classes" do
      it "returns 200" do
        get "/build/character_classes"
        expect(response).to have_http_status(:ok)
      end

      it "lists character classes by full identifier" do
        get "/build/character_classes"
        expect(response.body).to include("#{handle.identifier}/puncher")
      end
    end

    describe "GET /build/character_classes/:id" do
      it "returns 200" do
        get "/build/character_classes/#{character_class.id}"
        expect(response).to have_http_status(:ok)
      end

      it "shows the full identifier" do
        get "/build/character_classes/#{character_class.id}"
        expect(response.body).to include("#{handle.identifier}/puncher")
      end
    end

    describe "GET /build/character_classes/new" do
      it "returns 200" do
        get "/build/character_classes/new"
        expect(response).to have_http_status(:ok)
      end
    end

    describe "POST /build/character_classes" do
      let(:valid_params) do
        {character_class: {handle_id: handle.id, identifier: "warbinder", location: "https://example.com/warbinder.json"}}
      end

      context "with valid params" do
        it "creates a character class and redirects to show" do
          expect {
            post "/build/character_classes", params: valid_params
          }.to change(CharacterClass, :count).by(1)
          expect(response).to redirect_to(build_character_class_path(CharacterClass.last))
        end

        it "sets the user to current_user" do
          post "/build/character_classes", params: valid_params
          expect(CharacterClass.last.user).to eq(user)
        end
      end

      context "with an invalid identifier" do
        it "re-renders new with an error" do
          post "/build/character_classes", params: {character_class: valid_params[:character_class].merge(identifier: "ab")}
          expect(response).to have_http_status(:unprocessable_content)
          expect(response.body).to include("at least 3 characters")
        end
      end

      context "with a duplicate identifier" do
        it "re-renders new with an error" do
          post "/build/character_classes", params: {character_class: valid_params[:character_class].merge(identifier: "puncher")}
          expect(response).to have_http_status(:unprocessable_content)
          expect(response.body).to include("already been taken")
        end
      end
    end
  end
end
