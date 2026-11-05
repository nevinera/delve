require "rails_helper"

RSpec.describe "Characters", type: :request do
  let(:user) { create(:user) }
  let(:look) { {"hair" => "long", "jewelry" => ["earrings"], "colors" => {"skin" => "#e0b48c"}} }

  it "needs a signed-in user" do
    get characters_path
    expect(response).to redirect_to("/login")
  end

  context "when signed in" do
    before { sign_in user }

    it "lists your characters and not anyone else's" do
      create(:character, user:, name: "Arwen")
      create(:character, name: "Boromir")
      get characters_path
      expect(response.body).to include("Arwen")
      expect(response.body).not_to include("Boromir")
    end

    it "gives each character buttons for the worlds it played last" do
      arwen = create(:character, user:, name: "Arwen")
      world = create(:world, repo: "them/vale", released_sha: "abc")
      WorldCharacter.create!(world:, character: arwen)
      get characters_path
      expect(response.body).to include(%(href="#{play_path(world, character: arwen.id)}"))
    end

    it "opens the builder for a new character" do
      get new_character_path
      expect(response).to have_http_status(:ok)
      expect(response.body).to include('<canvas id="stage"')
      expect(response.body).to include('data-save-method="POST"')
    end

    it "sends the old builder address to a new character" do
      get "/character_builder"
      expect(response).to redirect_to("/characters/new")
    end

    it "makes a character with its look" do
      post characters_path, params: {character: {name: "arwen", look:}}, as: :json
      expect(response).to have_http_status(:created)
      character = user.characters.sole
      expect(character).to have_attributes(name: "Arwen", look:)
      expect(response.parsed_body).to include("name" => "Arwen", "edit_url" => edit_character_path(character))
    end

    it "refuses a name that's taken, whatever its case" do
      create(:character, name: "Arwen")
      post characters_path, params: {character: {name: "ARWEN", look:}}, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["errors"]).to include("Name has already been taken")
    end

    it "refuses a name with more than letters" do
      post characters_path, params: {character: {name: "Ar wen", look:}}, as: :json
      expect(response.parsed_body["errors"]).to include("Name can only have letters")
    end

    it "opens the builder on one of your characters" do
      character = create(:character, user:, name: "Arwen", look:)
      get edit_character_path(character)
      expect(response.body).to include('data-save-method="PATCH"')
      expect(response.body).to include("&quot;hair&quot;:&quot;long&quot;")
    end

    it "changes a character's look but never its name" do
      character = create(:character, user:, name: "Arwen")
      patch character_path(character), params: {character: {name: "Eowyn", look: {"hair" => "bun"}}}, as: :json
      expect(response).to have_http_status(:ok)
      expect(character.reload).to have_attributes(name: "Arwen", look: {"hair" => "bun"})
    end

    it "has no name field or delete button when you're making a character, and both the other way round when editing" do
      get new_character_path
      expect(response.body).to include(%(id="name"))
      expect(response.body).not_to include("deleteCharacter")
      get edit_character_path(create(:character, user:, name: "Arwen"))
      expect(response.body).not_to include(%(id="name"))
      expect(response.body).to include(%(id="deleteCharacter"))
    end

    it "doesn't touch someone else's character" do
      character = create(:character, name: "Boromir")
      patch character_path(character), params: {character: {name: "Mine"}}, as: :json
      expect(response).to have_http_status(:not_found)
      expect(character.reload.name).to eq("Boromir")
    end

    it "deletes a character" do
      character = create(:character, user:)
      expect { delete character_path(character) }.to change(Character, :count).by(-1)
      expect(response).to redirect_to(characters_path)
    end
  end
end
