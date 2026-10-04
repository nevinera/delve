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
    #           :extended (true also runs the slowest, 1200s duration; the
    #           class editor never sends it)
    #
    # Runs class, once per entry in its statPriorities, against every
    # (elevation x duration) cell - neither side is something a caller picks.
    #
    # Returns {"results" => [{"priority", "durationSeconds", "elevation",
    # "elevationLabel", "dps", "basicAttackDamage", "powerDamage",
    # "statusTickDamage", "totalDamage"}, ...]}, one entry per
    # (durationSeconds, elevation) pair.
    def simulate(attrs)
      validate_attrs(attrs, required: [:class], supported: [:strategy, :extended])
      post("/class-dps-sim", attrs)
    end
  end
end
