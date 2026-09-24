module Validators
  # Settable on Zone, Map, and Unit (docs/schema/common.md#respawnconfig) -
  # this validator is shared by all three, since the shape is identical
  # everywhere.
  class RespawnConfigValidator < Base
    TYPE_OPTIONS = %w[none timer].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, TYPE_OPTIONS, path: child_path(path, "type"))
      validate_timer!(data, path: path) if type == "timer"
    end

    private

    def validate_timer!(data, path:)
      delay_seconds = require_numeric!(data, "delaySeconds", path: path)
      raise ValidationError.new("delaySeconds must be non-negative", path: child_path(path, "delaySeconds")) if delay_seconds < 0
    end
  end
end
