# frozen_string_literal: true

module Bot
  module Strategies
    # Turns slowly left, in place. Config: degrees_per_second (default 15).
    class Spin < Strategy
      def initialize(config = {})
        super
        @rate = Float(config.fetch("degrees_per_second", 15))
      rescue ArgumentError, TypeError
        raise ConfigError, "degrees_per_second must be a number"
      end

      def tick(_state, controls, now)
        controls.turn(-@rate * (now - @last)) if @last
        @last = now
      end
    end
  end
end
