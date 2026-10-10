# frozen_string_literal: true

module Bot
  # A bot's behavior. Built with its config (a Hash, string keys); the
  # runner calls tick about ten times a second once the game state has
  # loaded, with a GameState, the Controls, and the monotonic time in
  # seconds. on_message gets every message that isn't game state (quest
  # offers, zone exits, and so on).
  class Strategy
    ConfigError = Class.new(StandardError)

    attr_reader :config

    def initialize(config = {})
      @config = config
    end

    def tick(state, controls, now)
    end

    def on_message(msg)
    end
  end
end
