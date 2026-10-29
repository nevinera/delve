module Bot
  # A bot's behavior. Built with its config (a Hash, string keys); the runner calls tick about ten
  # times a second once the bot has entered, with the State, the Controls, and the monotonic time in
  # seconds.
  class Strategy
    ConfigError = Class.new(StandardError)

    attr_reader :config

    def initialize(config = {})
      @config = config
    end

    def tick(state, controls, now)
    end
  end
end
