require "rails_helper"

RSpec.describe GameApi::WorldVersionsClient do
  let(:client) { described_class.new(base_url: "http://game-test.local", auth_tokens: "test-token") }

  describe "#expire" do
    it "posts the expiry as RFC 3339 UTC" do
      stub = stub_request(:post, "http://game-test.local/world-versions/7/expire")
        .with(body: {expires_at: "2030-01-02T03:04:05Z"}.to_json, headers: {"Authorization" => "Bearer test-token"})
        .to_return(status: 200, headers: {"Content-Type" => "application/json"}, body: {instances_updated: 2}.to_json)

      result = client.expire(7, Time.utc(2030, 1, 2, 3, 4, 5))

      expect(stub).to have_been_requested
      expect(result).to eq("instances_updated" => 2)
    end
  end
end
