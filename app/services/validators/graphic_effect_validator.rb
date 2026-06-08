module Validators
  class GraphicEffectValidator < Base
    ORIGIN_OPTIONS = %w[self affected].freeze
    WHEN_OPTIONS = %w[immediate impact].freeze
    CONDITION_OPTIONS = %w[always onHit onMiss].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "sourceURL", path: path)
      require_numeric!(data, "duration", path: path)
      from = require_string!(data, "from", path: path)
      require_one_of!(from, ORIGIN_OPTIONS, path: child_path(path, "from"))
      if data.key?("to")
        to = data["to"]
        raise ValidationError.new("to must be a string", path: child_path(path, "to")) unless to.is_a?(String)
        require_one_of!(to, ORIGIN_OPTIONS, path: child_path(path, "to"))
      end
      when_val = require_string!(data, "when", path: path)
      require_one_of!(when_val, WHEN_OPTIONS, path: child_path(path, "when"))
      condition = require_string!(data, "condition", path: path)
      require_one_of!(condition, CONDITION_OPTIONS, path: child_path(path, "condition"))
    end
  end
end
