# frozen_string_literal: true

module Bot
  module Strategies
    # Walks toward another player once they're within notice_feet, stopping
    # stop_feet away (both edge to edge), and stands still otherwise.
    # Config: {"target": "<character name>", "notice_feet": 30, "stop_feet": 5}.
    # No pathing yet: it walks straight at them.
    class Follow < Strategy
      def initialize(config = {})
        super
        @target = config["target"].presence or raise ConfigError, "follow needs a target (a character name)"
        @notice = feet("notice_feet", 30)
        @stop = feet("stop_feet", 5)
        raise ConfigError, "stop_feet must be less than notice_feet" unless @stop < @notice
      end

      def tick(state, controls, _now)
        me, target = state.me, state.player(@target)
        distance = state.distance(me, target)
        return controls.stop if distance.nil? || distance > @notice || distance <= @stop
        approach(me, target, controls)
      end

      private

      # move_toward stops on center distance: stop_feet plus both radii.
      def approach(me, target, controls)
        pos = target["position"]
        controls.move_toward(pos["x"], pos["y"], @stop + me["radius"].to_f + target["radius"].to_f)
      end

      def feet(key, default)
        Float(config.fetch(key, default)).tap { |f| raise ArgumentError if f.negative? }
      rescue ArgumentError, TypeError
        raise ConfigError, "#{key} must be a number of feet, zero or more"
      end
    end
  end
end
