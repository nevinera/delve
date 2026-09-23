# frozen_string_literal: true

require_relative "base_client"

module GameApi
  class ClassDpsSimClient < BaseClient
    # Required: :class (a CharacterClass hash, same shape the class editor
    #           already authors)
    # Optional: :strategy (a priority-ordered array of
    #           {power:, condition: {type:, on:, status:}} entries - the
    #           class's own rotation; a CharacterClass has no UnitType.Tactics
    #           to fall back on, so an omitted/empty strategy means "basic
    #           attack only")
    #
    # Runs class against every (elevation x duration) cell - 4 elevations
    # ("trainee"/"dungeon"/"heroic"/"raid", ee = -20/-10/0/10) x 3 durations
    # (60s/300s/1200s) - neither side is something a caller picks.
    #
    # Returns {"results" => [{"durationSeconds", "elevation",
    # "elevationLabel", "dps", "basicAttackDamage", "powerDamage",
    # "statusTickDamage", "totalDamage"}, ...]}, one entry per
    # (durationSeconds, elevation) pair.
    def simulate(attrs)
      validate_attrs(attrs, required: [:class], supported: [:strategy])
      post("/class-dps-sim", attrs)
    end
  end
end
