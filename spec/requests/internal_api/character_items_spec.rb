require "rails_helper"

RSpec.describe "POST /internal_api/world_characters/:id/character_items", type: :request do
  let(:zone) { create(:zone) }
  let(:world_character) { create(:world_character, world: zone.world_version.world, world_version: zone.world_version) }
  let(:valid_token) { "test-token" }

  let(:valid_body) do
    {
      zone: {database_id: zone.id.to_s, identifier: zone.identifier, version: zone.world_version.commit_sha},
      identifier: "sword-of-doom",
      name: "Sword of Doom",
      slot: "main_hand",
      elvl: 584,
      primary: "strength",
      secondaries: ["crit_rating"]
    }
  end

  before do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("INTERNAL_API_TOKENS", "").and_return(valid_token)
  end

  def post_item(body: valid_body, token: valid_token, id: world_character.id)
    headers = token ? {"X-Internal-Token" => token} : {}
    post "/internal_api/world_characters/#{id}/character_items", params: body.to_json,
      headers: headers.merge("Content-Type" => "application/json")
  end

  it "awards the item and returns its id" do
    post_item
    expect(response).to have_http_status(:created)
    item = world_character.character_items.sole
    expect(response.parsed_body["id"]).to eq(item.id)
    expect(item).to have_attributes(primary_stat: "strength", secondary_stats: ["crit_rating"])
  end

  it "returns 409 for an item already held at this definition" do
    post_item
    post_item
    expect(response).to have_http_status(:conflict)
    expect(response.parsed_body["status"]).to eq("already_owned_this_version")
    expect(world_character.character_items.count).to eq(1)
  end

  it "reports an upgrade when an older definition is held" do
    post_item(body: valid_body.merge(elvl: 500))
    post_item
    expect(response).to have_http_status(:created)
    expect(response.parsed_body["status"]).to eq("already_owned_other_version")
  end

  it "returns 422 for an upgrade_only award with nothing to upgrade" do
    post_item(body: valid_body.merge(upgrade_only: true))
    expect(response).to have_http_status(:unprocessable_content)
  end

  it "returns 422 for a zone outside the world character's version" do
    post_item(body: valid_body.merge(zone: {database_id: create(:zone).id.to_s, identifier: zone.identifier}))
    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body["error"]).to include("isn't in")
  end

  it "returns 422 for an invalid slot" do
    post_item(body: valid_body.merge(slot: "tail"))
    expect(response).to have_http_status(:unprocessable_content)
  end

  it "returns 404 for an unknown world character" do
    post_item(id: 0)
    expect(response).to have_http_status(:not_found)
  end

  it "returns 401 with a bad token" do
    post_item(token: "wrong")
    expect(response).to have_http_status(:unauthorized)
  end
end
