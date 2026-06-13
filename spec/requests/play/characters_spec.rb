require "rails_helper"

RSpec.describe "Play::Characters", type: :request do
  let(:user) { create(:user) }
  let(:character_class) { create(:character_class, state: :fetched) }
  let!(:character) { create(:character, user: user, character_class: character_class, name: "Ariana-AA") }

  context "when not logged in" do
    it "redirects index to login" do
      get "/play/characters"
      expect(response).to redirect_to("/login")
    end

    it "redirects show to login" do
      get "/play/characters/#{character.id}"
      expect(response).to redirect_to("/login")
    end

    it "redirects new to login" do
      get "/play/characters/new"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    describe "GET /play/characters" do
      it "returns 200" do
        get "/play/characters"
        expect(response).to have_http_status(:ok)
      end

      it "lists the user's characters" do
        get "/play/characters"
        expect(response.body).to include("Ariana-AA")
      end
    end

    describe "GET /play/characters/:id" do
      it "returns 200" do
        get "/play/characters/#{character.id}"
        expect(response).to have_http_status(:ok)
      end

      it "shows the character name" do
        get "/play/characters/#{character.id}"
        expect(response.body).to include("Ariana-AA")
      end
    end

    describe "GET /play/characters/new" do
      it "returns 200" do
        get "/play/characters/new"
        expect(response).to have_http_status(:ok)
      end
    end

    describe "POST /play/characters" do
      context "with valid params" do
        it "creates a character and redirects to show" do
          expect {
            post "/play/characters", params: {character: {name: "Briana-BB", character_class_id: character_class.id, token_url: "https://example.com/token.webp"}}
          }.to change(Character, :count).by(1)
          expect(response).to redirect_to(play_character_path(Character.last))
        end
      end

      context "with an invalid name" do
        it "re-renders new with an error" do
          post "/play/characters", params: {character: {name: "Bad1", character_class_id: character_class.id}}
          expect(response).to have_http_status(:unprocessable_content)
          expect(response.body).to include("letters and dashes")
        end
      end

      context "with a duplicate name" do
        it "re-renders new with an error" do
          post "/play/characters", params: {character: {name: "Ariana-AA", character_class_id: character_class.id}}
          expect(response).to have_http_status(:unprocessable_content)
          expect(response.body).to include("already been taken")
        end
      end
    end
  end
end
