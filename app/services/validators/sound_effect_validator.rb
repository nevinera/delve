module Validators
  class SoundEffectValidator < Base
    LOCATION_OPTIONS = %w[self affected].freeze
    WHEN_OPTIONS = %w[immediate impact].freeze
    CONDITION_OPTIONS = %w[always onHit onMiss].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "sourceURL", path: path)
      require_numeric!(data, "duration", path: path)
      location = require_string!(data, "location", path: path)
      require_one_of!(location, LOCATION_OPTIONS, path: child_path(path, "location"))
      when_val = require_string!(data, "when", path: path)
      require_one_of!(when_val, WHEN_OPTIONS, path: child_path(path, "when"))
      condition = require_string!(data, "condition", path: path)
      require_one_of!(condition, CONDITION_OPTIONS, path: child_path(path, "condition"))
    end
  end
end
