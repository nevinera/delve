require "rails_helper"

RSpec.describe FetchZoneContentJob, type: :job do
  let(:user) { create(:user) }
  let(:handle) { create(:handle, user: user) }
  let(:zone) { create(:zone, handle: handle, registering_user: user) }
  let(:content) { '{"name":"Goblin Cave","private":true}' }

  before do
    stub_request(:get, zone.config_url).to_return(body: content, status: 200)
  end

  it "updates state to fetched" do
    described_class.perform_now(zone.id)
    expect(zone.reload.state).to eq("fetched")
  end

  it "stores a SHA1 hash of the response body" do
    described_class.perform_now(zone.id)
    expect(zone.reload.content_sha).to eq(Digest::SHA1.hexdigest(content))
  end

  it "stores the byte size of the response body" do
    described_class.perform_now(zone.id)
    expect(zone.reload.file_size).to eq(content.bytesize)
  end

  it "raises when the URL returns a non-success response" do
    stub_request(:get, zone.config_url).to_return(status: 404)
    expect { described_class.perform_now(zone.id) }.to raise_error(RuntimeError, /HTTP 404/)
  end
end
