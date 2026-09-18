# frozen_string_literal: true

require_relative "base_client"

module GameApi
  class DpsSimClient < BaseClient
    # Required: :enemy (a UnitType hash, same shape a zone config/unit-type
    #           editor already authors), :target ({strength, agility,
    #           intellect, defenceRating, maxHealth} - already-resolved
    #           final stats, not equipped items)
    # Optional: :durationSeconds (default 300, max 3600 - see the game
    #           server's MaxDPSSimDuration), :seed (int; omit for a fresh,
    #           non-reproducible run)
    #
    # Returns {"durationSeconds", "dps", "ttdSeconds", "basicAttackDamage",
    #          "powerDamage", "statusTickDamage", "totalDamage"}.
    # ttdSeconds is nil when the target takes no damage at all.
    def simulate(attrs)
      validate_attrs(attrs, required: %i[enemy target], supported: %i[durationSeconds seed])
      post("/dps-sim", attrs)
    end
  end
end
