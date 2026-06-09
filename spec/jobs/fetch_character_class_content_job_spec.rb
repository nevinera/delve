require "rails_helper"

RSpec.describe FetchCharacterClassContentJob, type: :job do
  let(:user) { create(:user) }
  let(:handle) { create(:handle, user: user) }
  let(:character_class) { create(:character_class, user: user, handle: handle) }
  let(:content) { '{"name":"Puncher","colors":{"major":"8B4513","minor":"F4A460"}}' }

  before do
    stub_request(:get, character_class.location).to_return(body: content, status: 200)
  end

  it "updates state to fetched" do
    described_class.perform_now(character_class.id)
    expect(character_class.reload.state).to eq("fetched")
  end

  it "stores a SHA1 hash of the response body" do
    described_class.perform_now(character_class.id)
    expect(character_class.reload.content_sha).to eq(Digest::SHA1.hexdigest(content))
  end

  it "stores the byte size of the response body" do
    described_class.perform_now(character_class.id)
    expect(character_class.reload.file_size).to eq(content.bytesize)
  end

  it "raises when the URL returns a non-success response" do
    stub_request(:get, character_class.location).to_return(status: 404)
    expect { described_class.perform_now(character_class.id) }.to raise_error(RuntimeError, /HTTP 404/)
  end
end
