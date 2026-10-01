require "rails_helper"

RSpec.describe "Build local zone plays", type: :request do
  let(:user) { create(:user) }
  let(:character_class) { create(:character_class, state: :fetched) }
  let!(:character) { create(:character, user:, character_class:) }
  let(:zone_url) { "http://localhost:8001/zones/forest/glade/glade.full.json" }
  let(:zone_body) { File.read(Rails.root.join("spec/fixtures/zones/goblin-cave.full.json")) }
  let(:join_result) { JoinZone::Result.new(token: "tok", instance_identifier: "inst", slot_id: "slot") }
  let(:local_content_url) { "http://localhost:8001" }

  before do
    sign_in user
    allow(Rails.configuration.x).to receive(:local_content_url).and_return(local_content_url)
    stub_request(:get, zone_url).to_return(body: zone_body)
    allow(JoinDirectZone).to receive(:call).and_return(join_result)
  end

  it "works without a GitHub connection" do
    get "/build/local_zones/forest/glade/play", params: {character_id: character.id}
    expect(response).to have_http_status(:ok)
    expect(response.body).to include(%(data-zone-source-url="#{zone_url}"))
  end

  it "versions the instance by the file's content" do
    get "/build/local_zones/forest/glade/play", params: {character_id: character.id}
    expect(JoinDirectZone).to have_received(:call).with(hash_including(
      zone_key: "forest/glade", source_url: zone_url, commit_sha: "local-#{Digest::SHA1.hexdigest(zone_body).first(12)}"
    ))
  end

  it "links each character to the local play path" do
    get "/build/local_zones/forest/glade/play"
    expect(response.body).to include("/build/local_zones/forest/glade/play?character_id=#{character.id}")
  end

  it "redirects the key form to the zone's play page" do
    get "/build/local_zones", params: {key: "/forest/glade/"}
    expect(response).to redirect_to("/build/local_zones/forest/glade/play")
  end

  it "shows the key form" do
    get "/build/local_zones"
    expect(response.body).to include("Play a local zone", local_content_url)
  end

  it "lets the Build dashboard through without GitHub, linking local play" do
    get "/build"
    expect(response).to have_http_status(:ok)
    expect(response.body).to include("Play a local zone", "Connect GitHub")
  end

  context "when local content isn't configured" do
    let(:local_content_url) { nil }

    it "has no local play" do
      get "/build/local_zones/forest/glade/play", params: {character_id: character.id}
      expect(response).to have_http_status(:not_found)
    end

    it "sends the dashboard to GitHub connect" do
      get "/build"
      expect(response).to redirect_to(github_connect_path)
    end
  end
end
