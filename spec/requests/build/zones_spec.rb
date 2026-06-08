require "rails_helper"

RSpec.describe "Build::Zones", type: :request do
  let(:user) { create(:user) }
  let(:handle) { create(:handle, user: user) }
  let!(:zone) { create(:zone, handle: handle, registering_user: user, identifier: "goblin_cave", version: "1.0", name: "Goblin Cave") }

  context "when not logged in" do
    it "redirects index to login" do
      get "/build/zones"
      expect(response).to redirect_to("/login")
    end

    it "redirects show to login" do
      get "/build/zones/#{zone.id}"
      expect(response).to redirect_to("/login")
    end

    it "redirects new to login" do
      get "/build/zones/new"
      expect(response).to redirect_to("/login")
    end
  end

  context "when logged in" do
    before { sign_in user }

    describe "GET /build/zones" do
      it "returns 200" do
        get "/build/zones"
        expect(response).to have_http_status(:ok)
      end

      it "lists zones by identifier" do
        get "/build/zones"
        expect(response.body).to include("goblin_cave")
      end
    end

    describe "GET /build/zones/:id" do
      it "returns 200" do
        get "/build/zones/#{zone.id}"
        expect(response).to have_http_status(:ok)
      end

      it "shows the zone name" do
        get "/build/zones/#{zone.id}"
        expect(response.body).to include("Goblin Cave")
      end
    end

    describe "GET /build/zones/new" do
      it "returns 200" do
        get "/build/zones/new"
        expect(response).to have_http_status(:ok)
      end
    end

    describe "POST /build/zones" do
      let(:valid_params) do
        {zone: {handle_id: handle.id, identifier: "spider_den", version: "1.0", name: "Spider Den", config_url: "https://example.com/spider-den.json"}}
      end

      context "with valid params" do
        it "creates a zone and redirects to show" do
          expect {
            post "/build/zones", params: valid_params
          }.to change(Zone, :count).by(1)
          expect(response).to redirect_to(build_zone_path(Zone.last))
        end

        it "sets the registering user to current_user" do
          post "/build/zones", params: valid_params
          expect(Zone.last.registering_user).to eq(user)
        end
      end

      context "with an invalid identifier" do
        it "re-renders new with an error" do
          post "/build/zones", params: {zone: valid_params[:zone].merge(identifier: "Bad-Zone")}
          expect(response).to have_http_status(:unprocessable_content)
          expect(response.body).to include("may only contain lowercase letters and underscores")
        end
      end

      context "with a duplicate identifier and version" do
        it "re-renders new with an error" do
          post "/build/zones", params: {zone: valid_params[:zone].merge(identifier: "goblin_cave", version: "1.0")}
          expect(response).to have_http_status(:unprocessable_content)
          expect(response.body).to include("already registered")
        end
      end
    end
  end
end
