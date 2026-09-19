# frozen_string_literal: true

require_relative "base_client"

module GameApi
  class DpsSimClient < BaseClient
    # Required: :enemy (a UnitType hash, same shape a zone config/unit-type
    #           editor already authors)
    # Optional: :durationSeconds (default 300, max 3600 - see the game
    #           server's MaxDPSSimDuration), :seed (int; omit for a fresh,
    #           non-reproducible run)
    #
    # Runs enemy against every mocked gearing plan ("offense",
    # "offenseWithDefense", "defense") x relative elevation (-10, -5, 0)
    # cell - the target side isn't something a caller specifies.
    #
    # Returns {"results" => [{"gearingPlan", "elevation", "dps",
    # "ttdSeconds", "basicAttackDamage", "powerDamage", "statusTickDamage",
    # "totalDamage"}, ...]}, one entry per (gearingPlan, elevation) pair.
    # ttdSeconds is nil for a cell where the target takes no damage at all.
    def simulate(attrs)
      validate_attrs(attrs, required: %i[enemy], supported: %i[durationSeconds seed])
      post("/dps-sim", attrs)
    end
  end
end
