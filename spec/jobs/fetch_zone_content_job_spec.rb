require "rails_helper"

RSpec.describe FetchZoneContentJob, type: :job do
  let(:user) { create(:user) }
  let(:handle) { create(:handle, user: user) }
  let(:zone) { create(:zone, handle: handle, registering_user: user) }
  let(:valid_content) { File.read(Rails.root.join("..", "delve-content", "zones", "goblin-cave.full.json")) }
  let(:invalid_json_content) { "not valid json{{{" }
  let(:invalid_zone_content) { '{"name":"Goblin Cave"}' }

  before do
    stub_request(:get, zone.config_url).to_return(body: valid_content, status: 200)
  end

  it "updates state to fetched on valid content" do
    described_class.perform_now(zone.id)
    expect(zone.reload.state).to eq("fetched")
  end

  it "stores a SHA1 hash of the response body" do
    described_class.perform_now(zone.id)
    expect(zone.reload.content_sha).to eq(Digest::SHA1.hexdigest(valid_content))
  end

  it "stores the byte size of the response body" do
    described_class.perform_now(zone.id)
    expect(zone.reload.file_size).to eq(valid_content.bytesize)
  end

  it "raises when the URL returns a non-success response" do
    stub_request(:get, zone.config_url).to_return(status: 404)
    expect { described_class.perform_now(zone.id) }.to raise_error(RuntimeError, /HTTP 404/)
  end

  context "when the response body is not valid JSON" do
    before { stub_request(:get, zone.config_url).to_return(body: invalid_json_content, status: 200) }

    it "sets state to invalid" do
      described_class.perform_now(zone.id)
      expect(zone.reload.state).to eq("validation_failed")
    end

    it "stores an error message mentioning invalid JSON" do
      described_class.perform_now(zone.id)
      expect(zone.reload.validity_error).to match(/invalid JSON/)
    end
  end

  context "when the zone content fails validation" do
    before { stub_request(:get, zone.config_url).to_return(body: invalid_zone_content, status: 200) }

    it "sets state to invalid" do
      described_class.perform_now(zone.id)
      expect(zone.reload.state).to eq("validation_failed")
    end

    it "stores the validation error message" do
      described_class.perform_now(zone.id)
      expect(zone.reload.validity_error).to be_present
    end

    it "does not store content_sha" do
      described_class.perform_now(zone.id)
      expect(zone.reload.content_sha).to be_nil
    end
  end
end
