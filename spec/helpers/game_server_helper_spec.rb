require "rails_helper"

RSpec.describe GameServerHelper, type: :helper do
  describe "#game_server_public_url" do
    around do |example|
      keys = %w[GAME_SERVER_PUBLIC_URL GAME_SERVER_URL]
      saved = ENV.values_at(*keys)
      keys.each { |k| ENV.delete(k) }
      example.run
    ensure
      keys.zip(saved).each { |k, v| v ? ENV[k] = v : ENV.delete(k) }
    end

    it "defaults to localhost" do
      expect(helper.game_server_public_url).to eq("http://localhost:8090")
    end

    it "falls back to GAME_SERVER_URL" do
      ENV["GAME_SERVER_URL"] = "http://game:8090"
      expect(helper.game_server_public_url).to eq("http://game:8090")
    end

    it "prefers GAME_SERVER_PUBLIC_URL" do
      ENV["GAME_SERVER_URL"] = "http://game:8090"
      ENV["GAME_SERVER_PUBLIC_URL"] = "https://play.example.com"
      expect(helper.game_server_public_url).to eq("https://play.example.com")
    end
  end
end
