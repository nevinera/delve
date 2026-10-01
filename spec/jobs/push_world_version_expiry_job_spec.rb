require "rails_helper"

RSpec.describe PushWorldVersionExpiryJob, type: :job do
  let(:client) { instance_double(GameApi::WorldVersionsClient, expire: {"instances_updated" => 1}) }

  before { allow(GameApi).to receive(:world_versions).and_return(client) }

  it "sends the version's expiry to the game server" do
    version = create(:world_version, :released, expires_at: Time.utc(2030, 1, 2))
    described_class.perform_now(version.id)
    expect(client).to have_received(:expire).with(version.id, version.expires_at)
  end

  it "does nothing for a version that isn't expiring" do
    described_class.perform_now(create(:world_version, :released).id)
    expect(client).not_to have_received(:expire)
  end
end
