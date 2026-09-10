require "rails_helper"

RSpec.describe "Build::Validators", type: :request do
  let(:user) { create(:user) }

  context "when not logged in" do
    it "redirects to login" do
      post "/build/validators/ability", params: {name: "Punch", castTime: nil, globalCooldown: 1.0, effects: []}.to_json,
        headers: {"Content-Type" => "application/json"}
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    describe "POST /build/validators/ability" do
      it "returns valid: true for a valid ability" do
        ability = {name: "Punch", castTime: nil, globalCooldown: 1.0, effects: [
          {type: "harm", affects: "bTarget", range: 5.0, amount: [8.0, 12.0]}
        ]}

        post "/build/validators/ability", params: ability.to_json, headers: {"Content-Type" => "application/json"}

        expect(response).to have_http_status(:ok)
        expect(JSON.parse(response.body)).to eq({"valid" => true})
      end

      it "returns valid: false with the error message and path for an invalid ability" do
        ability = {name: "Punch", castTime: "soon", globalCooldown: 1.0, effects: []}

        post "/build/validators/ability", params: ability.to_json, headers: {"Content-Type" => "application/json"}

        expect(response).to have_http_status(:ok)
        body = JSON.parse(response.body)
        expect(body["valid"]).to eq(false)
        expect(body["error"]["message"]).to include("castTime must be a number or null")
        expect(body["error"]["path"]).to eq("$.castTime")
      end

      it "returns a 400 for a malformed JSON body" do
        post "/build/validators/ability", params: "not json", headers: {"Content-Type" => "application/json"}

        expect(response).to have_http_status(:bad_request)
        expect(JSON.parse(response.body)["valid"]).to eq(false)
      end
    end

    describe "POST /build/validators/character_class" do
      let(:valid_class) do
        {
          name: "Puncher", colors: {major: "8B4513", minor: "F4A460"},
          primaryStats: ["strength"],
          secondaryStats: %w[crit_rating haste_rating mastery_rating versatility_rating recovery_rating],
          wields: ["axe", "dagger"]
        }
      end

      it "returns valid: true for a valid (already-resolved) class" do
        post "/build/validators/character_class", params: valid_class.to_json, headers: {"Content-Type" => "application/json"}

        expect(response).to have_http_status(:ok)
        expect(JSON.parse(response.body)).to eq({"valid" => true})
      end

      it "returns valid: false with the error message and path for an invalid color" do
        invalid_class = valid_class.merge(colors: {major: "8B45", minor: "F4A460"})

        post "/build/validators/character_class", params: invalid_class.to_json, headers: {"Content-Type" => "application/json"}

        expect(response).to have_http_status(:ok)
        body = JSON.parse(response.body)
        expect(body["valid"]).to eq(false)
        expect(body["error"]["message"]).to include("major must be a 6-digit hex string")
        expect(body["error"]["path"]).to eq("$.colors.major")
      end

      it "rejects a class whose powers are still $ref pointers, not the resolved form" do
        abstract_class = valid_class.merge(powers: [{"$ref" => "../abilities/classes/puncher/punch.json", "referenceTo" => "power"}])

        post "/build/validators/character_class", params: abstract_class.to_json, headers: {"Content-Type" => "application/json"}

        body = JSON.parse(response.body)
        expect(body["valid"]).to eq(false)
        expect(body["error"]["message"]).to include("full JSON required")
      end
    end
  end
end
