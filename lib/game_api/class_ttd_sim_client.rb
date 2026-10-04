# frozen_string_literal: true

require_relative "base_client"

module GameApi
  class ClassTtdSimClient < BaseClient
    # Required: :class (a CharacterClass hash)
    # Optional: :strategy (priority-ordered rotation, as for ClassDpsSimClient)
    #           :extended (true raises the survival cap from 300s to 1200s;
    #           the class editor never sends it)
    #
    # Runs class, once per entry in its statPriorities, against the reference
    # pulls (open/g1 x solo/pair/group/swarm x physical/magic) at ee 0/-5/-10.
    #
    # Returns {"results" => [{"priority", "intendedFor", "pull", "school",
    # "elevation", "hpLostPct", "fightSeconds", "cleared", "died", "ttd",
    # "survives", "capSeconds"}, ...]}
    def simulate(attrs)
      validate_attrs(attrs, required: [:class], supported: [:strategy, :extended])
      post("/class-ttd-sim", attrs)
    end
  end
end
