# frozen_string_literal: true

module Bot
  # What the bot knows of its instance: every unit it can see, kept in step
  # with the server's full states and deltas (as client/src/game/state.js
  # does), and checked against each message's checksum.
  class GameState
    attr_reader :units

    # zone_data is the zone's content (as WorldContent.zone reads it), for
    # its maps.
    def initialize(character_name:, zone_data: {})
      @self_identifier = "player:#{character_name}"
      @maps = Array(zone_data["maps"]).index_by { |m| m["identifier"] }
      @pathfinders = {}
      @units = {}
      @loaded = false
    end

    def map(identifier) = @maps[identifier]

    # A Pathfinder for one of the zone's maps, built once per clearance.
    def pathfinder(identifier, clearance:)
      @pathfinders[[identifier, clearance]] ||= map(identifier)&.then { |m| Pathfinder.new(m, clearance:) }
    end

    # Applies an instance-state or delta message. Returns false when the
    # result disagrees with the server's checksum (ask for a full state).
    def apply(msg)
      case msg["type"]
      when "instance-state"
        @units = msg.fetch("units", {}).transform_values(&:dup)
        @loaded = true
      when "delta"
        apply_delta(msg)
      end
      GameApi::Checksum.compute_checksum(@units) == msg["checksum"]
    end

    def loaded? = @loaded

    # The bot's own unit.
    def me = @units.values.find { |u| u["zone_unit_identifier"] == @self_identifier }

    # Another player's unit, by character name (ignoring case).
    def player(name) = @units.values.find { |u| u["zone_unit_identifier"].casecmp?("player:#{name}") }

    # The space between two units' token edges, in feet: nil unless both are
    # placed on the same map.
    def distance(a, b)
      pa, pb = placed_together(a, b)
      return nil unless pa
      Math.hypot(pa["x"] - pb["x"], pa["y"] - pb["y"]) - a["radius"].to_f - b["radius"].to_f
    end

    # Other units within `feet` of the bot (edge to edge), nearest first.
    def units_within(feet)
      mine = me
      @units.values
        .reject { |u| u.equal?(mine) }
        .filter_map { |u| (d = distance(mine, u)) && d <= feet && [d, u] }
        .sort_by(&:first)
        .map(&:last)
    end

    private

    # Both units' positions, if they're placed on the same map.
    def placed_together(a, b)
      return unless a && b && a["map_identifier"] == b["map_identifier"]
      [a["position"], b["position"]] if a["position"] && b["position"]
    end

    def apply_delta(msg)
      apply_unit_changes(msg)
      Array(msg["effect_adds"]).each { |add| add_effect(add) }
      Array(msg["effect_removes"]).each { |rem| remove_effect(rem) }
    end

    def apply_unit_changes(msg)
      msg["unit_updates"].to_h.each { |id, patch| @units[id] = @units[id].to_h.merge(patch) }
      Array(msg["unit_removals"]).each { |id| @units.delete(id) }
    end

    def add_effect(add)
      return unless (unit = @units[add["unit_id"]])
      effects = others(unit, add)
      effects << add.slice("status_name", "applier_id", "stacks", "expires_at")
      @units[add["unit_id"]] = unit.merge("active_status_effects" => effects)
    end

    def remove_effect(rem)
      return unless (unit = @units[rem["unit_id"]])
      @units[rem["unit_id"]] = unit.merge("active_status_effects" => others(unit, rem))
    end

    def others(unit, effect)
      (unit["active_status_effects"] || []).reject do |e|
        e["status_name"] == effect["status_name"] && e["applier_id"] == effect["applier_id"]
      end
    end
  end
end
