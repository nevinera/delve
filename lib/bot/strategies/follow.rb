module Bot
  module Strategies
    # Runs toward another character once they're within notice_feet, stopping stop_feet away, and
    # stands still otherwise. Config: {"target": "<character name>", "notice_feet": 100,
    # "stop_feet": 5}. No pathing: it runs straight at them, at their height.
    class Follow < Strategy
      def initialize(config = {})
        super
        @target = config["target"].presence or raise ConfigError, "follow needs a target (a character name)"
        @notice = feet("notice_feet", 100)
        @stop = feet("stop_feet", 5)
        raise ConfigError, "stop_feet must be less than notice_feet" unless @stop < @notice
      end

      def tick(state, controls, _now)
        target = state.named(@target)
        me = {"at" => controls.at}
        return controls.stop if target.nil? || State.distance(me, target) > @notice
        x, y, z = target["at"]
        controls.move_toward(x, z, stop_within: @stop, y:)
      end

      private

      def feet(key, default)
        Float(config.fetch(key, default)).tap { |f| raise ArgumentError if f.negative? }
      rescue ArgumentError, TypeError
        raise ConfigError, "#{key} must be a number of feet, zero or more"
      end
    end
  end
end
