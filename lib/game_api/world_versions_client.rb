# frozen_string_literal: true

require_relative "base_client"

module GameApi
  class WorldVersionsClient < BaseClient
    # Starts the expiry countdown on every running instance of a world
    # version. Returns {"instances_updated" => n}.
    def expire(world_version_id, expires_at)
      post("/world-versions/#{world_version_id}/expire", {expires_at: expires_at.utc.iso8601})
    end
  end
end
