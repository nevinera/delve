# frozen_string_literal: true

module Bot
  # The strategies a bot can run, by the name the script takes.
  module Strategies
    NAMES = %w[null spin script follow goto brawler].freeze

    def self.build(name, config)
      raise Strategy::ConfigError, "unknown strategy #{name.inspect} (have: #{NAMES.join(", ")})" unless NAMES.include?(name)
      const_get(name.camelize).new(config)
    end
  end
end
