# frozen_string_literal: true

module Bot
  module Strategies
    # Runs a timed list of Controls calls, so any behavior can be fed in as
    # config. Config:
    #
    #   {"steps": [{"after": 0, "do": "move", "keys": ["forward"]},
    #              {"after": 1.5, "do": "face", "degrees": 90},
    #              {"after": 2, "do": "move_toward", "x": 10, "y": -4},
    #              {"after": 5, "do": "stop"}],
    #    "loop": false}
    #
    # Each step's `after` is seconds since the previous step (since the
    # first tick, for the first). With "loop", the steps repeat; otherwise
    # the bot idles after the last, unless that's a "quit".
    class Script < Strategy
      # Each action and the step keys it takes, in order.
      ACTIONS = {
        "move" => %w[keys],
        "face" => %w[degrees],
        "turn" => %w[degrees],
        "move_toward" => %w[x y],
        "stop" => [],
        "quit" => []
      }.freeze
      OPTIONAL = {"move_toward" => %w[stop_within]}.freeze

      def initialize(config = {})
        super
        @steps = Array(config["steps"]).each_with_index.map { |step, i| validate(step, i) }
        raise ConfigError, "steps must list at least one step" if @steps.empty?
        @loop = config["loop"] == true
        raise ConfigError, "a looping script needs some time between steps" if @loop && @steps.sum { |s| s[:after] }.zero?
        @index = 0
      end

      def tick(_state, controls, now)
        @due ||= now + @steps.first[:after]
        while @index < @steps.size && now >= @due
          perform(@steps[@index], controls)
          advance
        end
      end

      private

      def advance
        @index += 1
        @index = 0 if @loop && @index == @steps.size
        @due += @steps[@index][:after] if @index < @steps.size
      end

      def perform(step, controls)
        controls.public_send(step[:do], *step[:args], *step[:optional])
      end

      def validate(step, i)
        raise ConfigError, "step #{i + 1} must be an object" unless step.is_a?(Hash)
        action = step["do"]
        {do: action, args: args(step, i), optional: optional_args(step), after: after(step, i)}
      end

      def args(step, i)
        action = step["do"]
        params = ACTIONS.fetch(action) { unknown_action(action, i) }
        missing = params - step.keys
        raise ConfigError, "step #{i + 1} (#{action}) needs #{missing.join(", ")}" if missing.any?
        params.map { |p| step[p] }
      end

      def unknown_action(action, i)
        raise ConfigError, "step #{i + 1}: unknown action #{action.inspect} (have: #{ACTIONS.keys.join(", ")})"
      end

      def optional_args(step)
        OPTIONAL.fetch(step["do"], []).take_while { |p| step.key?(p) }.map { |p| step[p] }
      end

      def after(step, i)
        Float(step.fetch("after", 0)).tap { |s| raise ArgumentError if s.negative? }
      rescue ArgumentError, TypeError
        raise ConfigError, "step #{i + 1}: after must be a number of seconds, zero or more"
      end
    end
  end
end
