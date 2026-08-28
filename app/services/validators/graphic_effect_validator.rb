module Validators
  class GraphicEffectValidator < Base
    ORIGIN_OPTIONS = %w[self affected].freeze
    WHEN_OPTIONS = %w[immediate impact].freeze
    CONDITION_OPTIONS = %w[always onHit onMiss].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "sourceURL", path: path)
      require_numeric!(data, "duration", path: path)
      validate_from_field!(data, path: path)
      validate_to_field!(data, path: path) if data.key?("to")
      validate_when_field!(data, path: path)
      validate_condition_field!(data, path: path)
      validate_sprite_sheet!(data, path: path)
    end

    private

    def validate_from_field!(data, path:)
      from = require_string!(data, "from", path: path)
      require_one_of!(from, ORIGIN_OPTIONS, path: child_path(path, "from"))
    end

    def validate_to_field!(data, path:)
      to = data["to"]
      raise ValidationError.new("to must be a string", path: child_path(path, "to")) unless to.is_a?(String)
      require_one_of!(to, ORIGIN_OPTIONS, path: child_path(path, "to"))
    end

    def validate_when_field!(data, path:)
      when_val = require_string!(data, "when", path: path)
      require_one_of!(when_val, WHEN_OPTIONS, path: child_path(path, "when"))
    end

    def validate_condition_field!(data, path:)
      condition = require_string!(data, "condition", path: path)
      require_one_of!(condition, CONDITION_OPTIONS, path: child_path(path, "condition"))
    end

    def validate_sprite_sheet!(data, path:)
      has_columns = data.key?("spriteColumns")
      has_rows = data.key?("spriteRows")
      unless has_columns == has_rows
        raise ValidationError.new("spriteColumns and spriteRows must be given together", path: path)
      end
      return unless has_columns

      require_integer!(data, "spriteColumns", path: path)
      require_integer!(data, "spriteRows", path: path)
      require_integer!(data, "spriteFrameCount", path: path) if data.key?("spriteFrameCount")
      require_numeric!(data, "spriteFrameRate", path: path) if data.key?("spriteFrameRate")
    end
  end
end
