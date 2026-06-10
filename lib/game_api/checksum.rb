# frozen_string_literal: true

require "digest"
require "json"

module GameApi
  module Checksum
    # Mirrors the canonical form produced by instancestate/checksum.go.
    # The fixture at game-server/internal/instancestate/testdata/checksum_parity.json
    # is used by both the Go and Ruby tests to verify both sides agree.

    module_function

    def canonical_unit(u)
      pos = u["position"]
      {"id" => u["zone_unit_identifier"], "map" => u["map_identifier"],
       "x" => pos["x"], "y" => pos["y"], "angle" => pos["angle"],
       "health" => u["health"], "maxHealth" => u["max_health"],
       "resource" => u["resource"], "maxResource" => u["max_resource"],
       "status" => u["status"], "effects" => canonical_effects(u)}
    end

    def canonical_effects(u)
      (u["active_status_effects"] || [])
        .map { |e| {"id" => e["status_identifier"], "expiresAt" => e["expires_at"]} }
        .sort_by { |e| e["id"] }
    end

    def compute_checksum(units_by_id)
      sorted = units_by_id.values
        .map { |u| canonical_unit(u) }
        .sort_by { |u| u["id"] }
      Digest::SHA256.hexdigest(JSON.generate(sorted))
    end
  end
end
