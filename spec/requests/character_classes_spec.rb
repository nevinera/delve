require "rails_helper"

RSpec.describe "CharacterClasses", type: :request do
  let(:user) { create(:user) }
  let(:handle) { create(:handle, user: user, identifier: "nevinera") }
  let!(:character_class) { create(:character_class, user: user, handle: handle, identifier: "puncher") }

  context "when not logged in" do
    it "redirects index to login" do
      get "/classes"
      expect(response).to redirect_to("/login")
    end

    it "redirects show to login" do
      get "/classes/#{character_class.id}"
      expect(response).to redirect_to("/login")
    end

    it "redirects new to login" do
      get "/classes/new"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    describe "GET /classes" do
      it "returns 200" do
        get "/classes"
        expect(response).to have_http_status(:ok)
      end

      it "lists character classes by full identifier" do
        get "/classes"
        expect(response.body).to include("nevinera/puncher")
      end
    end

    describe "GET /classes/:id" do
      it "returns 200" do
        get "/classes/#{character_class.id}"
        expect(response).to have_http_status(:ok)
      end

      it "shows the full identifier" do
        get "/classes/#{character_class.id}"
        expect(response.body).to include("nevinera/puncher")
      end
    end

    describe "GET /classes/new" do
      it "returns 200" do
        get "/classes/new"
        expect(response).to have_http_status(:ok)
      end
    end

    describe "POST /classes" do
      let(:definition) { {"name" => "Warbinder", "description" => "A casting class"} }
      let(:location) { "https://example.com/warbinder.json" }

      before do
        stub_request(:get, location).to_return(body: definition.to_json, status: 200)
      end

      context "with valid params" do
        it "creates a character class and redirects to show" do
          expect {
            post "/classes", params: {character_class: {identifier: "warbinder", handle_id: handle.id, location: location}}
          }.to change(CharacterClass, :count).by(1)
          expect(response).to redirect_to(character_class_path(CharacterClass.last))
        end

        it "stores the slug identifier and associates the handle" do
          post "/classes", params: {character_class: {identifier: "warbinder", handle_id: handle.id, location: location}}
          cc = CharacterClass.last
          expect(cc.identifier).to eq("warbinder")
          expect(cc.handle).to eq(handle)
          expect(cc.full_identifier).to eq("nevinera/warbinder")
        end

        it "stores the fetched definition" do
          post "/classes", params: {character_class: {identifier: "warbinder", handle_id: handle.id, location: location}}
          expect(CharacterClass.last.definition).to eq(definition)
        end
      end

      context "when the location cannot be fetched" do
        before do
          stub_request(:get, location).to_return(status: 404)
        end

        it "re-renders new with an error" do
          post "/classes", params: {character_class: {identifier: "warbinder", handle_id: handle.id, location: location}}
          expect(response).to have_http_status(:unprocessable_entity)
          expect(response.body).to include("could not be fetched")
        end
      end
    end
  end
end
