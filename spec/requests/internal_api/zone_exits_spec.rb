require "rails_helper"

RSpec.describe "POST /internal_api/world_characters/:id/zone_exits", type: :request do
  let(:version) { published_world }
  let(:world_character) do
    create(:world_character, world: version.world, world_version: version, zone_identifier: "darkwood", connection_key: "camp/spawn")
  end

  before do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("INTERNAL_API_TOKENS", "").and_return("test-token")
  end

  def exit_zone(zone_identifier: "darkwood", connection: "road/north", token: "test-token", id: world_character.id)
    post "/internal_api/world_characters/#{id}/zone_exits",
      params: {zone_identifier:, connection:}, as: :json,
      headers: token ? {"X-Internal-Token" => token} : {}
  end

  it "moves the character to the far side of the link" do
    exit_zone
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to eq("zone_identifier" => "cave", "connection" => "mouth/in")
    expect(world_character.reload).to have_attributes(zone_identifier: "cave", connection_key: "mouth/in")
  end

  it "follows the link back the other way" do
    world_character.update!(zone_identifier: "cave", connection_key: "mouth/in")
    exit_zone(zone_identifier: "cave", connection: "mouth/in")
    expect(world_character.reload).to have_attributes(zone_identifier: "darkwood", connection_key: "road/north")
  end

  it "refuses an exit from a zone the character isn't in" do
    exit_zone(zone_identifier: "cave", connection: "mouth/in")
    expect(response).to have_http_status(:unprocessable_content)
    expect(world_character.reload.zone_identifier).to eq("darkwood")
  end

  it "refuses a connection that doesn't lead anywhere" do
    exit_zone(connection: "camp/spawn")
    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body["error"]).to include("doesn't lead anywhere")
  end

  it "doesn't read any world files" do
    exit_zone
    expect(a_request(:get, /raw.githubusercontent.com/)).not_to have_been_made
  end

  it "returns 404 for an unknown world character" do
    exit_zone(id: 0)
    expect(response).to have_http_status(:not_found)
  end

  it "requires the internal token" do
    exit_zone(token: nil)
    expect(response).to have_http_status(:unauthorized)
  end
end
