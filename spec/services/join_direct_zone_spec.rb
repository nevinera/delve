require "rails_helper"

RSpec.describe JoinDirectZone do
  let(:character) { create(:character) }
  let(:slots_client) { instance_double(GameApi::SlotsClient) }
  let(:class_content) { File.read(Rails.root.join("spec/fixtures/classes/puncher.full.json")) }
  let(:url) { "https://raw.githubusercontent.com/builder/content/c0ffee/zones/demo/demo.full.json" }

  before do
    allow(GameApi).to receive(:slots).and_return(slots_client)
    allow(slots_client).to receive(:request)
      .and_return({"instance_identifier" => "inst", "slot_id" => "slot", "token" => "tok"})
    stub_request(:get, character.character_class.location).to_return(body: class_content)
    character.character_class.update!(content_sha: Digest::SHA1.hexdigest(class_content))
  end

  def call
    described_class.call(character:, zone_key: "demo", commit_sha: "c0ffee", source_url: url, zone_data: {"name" => "Demo"},
      equipped_items: {"head" => {identifier: "trainee-head"}})
  end

  it "sends a direct-mode slot request keyed to the builder and commit" do
    call
    expect(slots_client).to have_received(:request).with(hash_including(
      zone_identifier: "demo",
      version: "c0ffee",
      database_id: "",
      source_url: url,
      zone_config: {"name" => "Demo"},
      mode: "direct",
      instance_key: "direct:#{character.user_id}:c0ffee:demo",
      owned_zone_items: {},
      equipped_items: {"head" => {identifier: "trainee-head"}}
    ))
  end

  it "records a slot session with no zone" do
    expect(call.token).to eq("tok")
    expect(SlotSession.find_by!(character:)).to have_attributes(zone: nil, token: "tok")
  end
end
