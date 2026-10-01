require "rails_helper"

RSpec.describe "Build::ZonePlays", type: :request do
  let(:user) { create(:user) }
  let(:character_class) { create(:character_class, state: :fetched) }
  let!(:character) { create(:character, user:, character_class:) }
  let(:api) { "https://api.github.com/repos/builder/content" }
  let(:raw_url) { "https://raw.githubusercontent.com/builder/content/c0ffee/zones/forest/glade/glade.full.json" }
  let(:zone_body) { File.read(Rails.root.join("spec/fixtures/zones/goblin-cave.full.json")) }
  let(:private_repo) { false }
  let(:join_result) { JoinZone::Result.new(token: "tok", instance_identifier: "inst", slot_id: "slot") }

  def stub_json(url, body)
    stub_request(:get, url).to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: body.to_json)
  end

  before do
    sign_in user
    create(:github_installation, user:, repo_full_name: "builder/content")
    stub_json(api, {private: private_repo, default_branch: "main"})
    stub_json("#{api}/git/ref/heads/main", {object: {type: "commit", sha: "c0ffee"}})
    stub_request(:get, raw_url).to_return(body: zone_body)
    allow(JoinDirectZone).to receive(:call).and_return(join_result)
  end

  it "asks which character to play as" do
    get "/build/zones/forest/glade/play"
    expect(response).to have_http_status(:ok)
    expect(response.body).to include("Play as #{character.name}", "character_id=#{character.id}")
    expect(JoinDirectZone).not_to have_received(:call)
  end

  it "joins the zone at the default branch's head and renders the game client" do
    get "/build/zones/forest/glade/play", params: {character_id: character.id}
    expect(response).to have_http_status(:ok)
    expect(response.body).to include('data-slot-token="tok"', %(data-zone-source-url="#{raw_url}"),
      %(data-zone-source-sha="#{Digest::SHA1.hexdigest(zone_body)}"))
    expect(response.body).not_to include("data-world-return-url")
    expect(JoinDirectZone).to have_received(:call).with(hash_including(
      character:, zone_key: "forest/glade", commit_sha: "c0ffee", source_url: raw_url
    ))
  end

  describe "imaginary trainee gear" do
    let(:zone_elvl) { JSON.parse(zone_body)["elvl"] }

    def equipped_elvls
      args = nil
      expect(JoinDirectZone).to have_received(:call) { |**kwargs| args = kwargs }
      args[:equipped_items].values.map { |item| item[:elvl] }.uniq
    end

    it "is at the zone's elevation by default" do
      get "/build/zones/forest/glade/play", params: {character_id: character.id}
      expect(equipped_elvls).to eq([zone_elvl])
    end

    it "is offset by ?elevation=, and never below 0" do
      get "/build/zones/forest/glade/play", params: {character_id: character.id, elevation: "+3"}
      expect(equipped_elvls).to eq([zone_elvl + 3])
    end

    it "clamps at 0" do
      get "/build/zones/forest/glade/play", params: {character_id: character.id, elevation: "-10000"}
      expect(equipped_elvls).to eq([0])
    end

    it "explains a malformed elevation" do
      get "/build/zones/forest/glade/play", params: {character_id: character.id, elevation: "high"}
      expect(response).to have_http_status(:service_unavailable)
      expect(response.body).to include("elevation must be a whole number")
    end

    it "carries the elevation through the character picker" do
      get "/build/zones/forest/glade/play", params: {elevation: "-5"}
      expect(response.body).to include("elevation=-5")
    end
  end

  it "returns 404 for another user's character" do
    get "/build/zones/forest/glade/play", params: {character_id: create(:character).id}
    expect(response).to have_http_status(:not_found)
  end

  context "with a private repo" do
    let(:private_repo) { true }

    it "explains that the repo must be public" do
      get "/build/zones/forest/glade/play", params: {character_id: character.id}
      expect(response).to have_http_status(:service_unavailable)
      expect(response.body).to include("is private")
    end
  end

  it "explains when the zone file is missing" do
    stub_request(:get, raw_url).to_return(status: 404)
    get "/build/zones/forest/glade/play", params: {character_id: character.id}
    expect(response).to have_http_status(:service_unavailable)
    expect(response.body).to include("HTTP 404")
  end

  it "explains when the zone file isn't valid JSON" do
    stub_request(:get, raw_url).to_return(body: "{nope")
    get "/build/zones/forest/glade/play", params: {character_id: character.id}
    expect(response).to have_http_status(:service_unavailable)
    expect(response.body).to include("isn&#39;t valid JSON")
  end

  it "explains when the zone is invalid" do
    stub_request(:get, raw_url).to_return(body: {"name" => "Glade"}.to_json)
    get "/build/zones/forest/glade/play", params: {character_id: character.id}
    expect(response).to have_http_status(:service_unavailable)
    expect(JoinDirectZone).not_to have_received(:call)
  end
end
