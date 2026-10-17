module Validators
  # A groundArea power effect: see docs/schema/power_effect.md.
  class GroundAreaValidator < Base
    AFFECTS_OPTIONS = %w[bAll gAll all].freeze
    TARGET_DIRECTION = "target".freeze

    def validate!(data, path: "$")
      validate_affects!(data, path: path)
      validate_positive_number!(data, "duration", path: path)
      validate_positive_number!(data, "tickInterval", path: path) if given?(data, "tickInterval")
      shape = require_hash!(data, "shape", path: path)
      AreaShapeValidator.validate!(shape, path: child_path(path, "shape"))
      validate_range!(data, shape, path: path)
      validate_tick_effects!(data, path: path)
      validate_optional!(data, path: path)
    end

    private

    def validate_optional!(data, path:)
      require_boolean!(data, "endsOnCasterDeath", path: path) if given?(data, "endsOnCasterDeath")
      return unless given?(data, "graphic")
      AreaGraphicValidator.validate!(require_hash!(data, "graphic", path: path), path: child_path(path, "graphic"))
    end

    def validate_affects!(data, path:)
      affects = require_string!(data, "affects", path: path)
      require_one_of!(affects, AFFECTS_OPTIONS, path: child_path(path, "affects"))
    end

    def validate_positive_number!(data, key, path:)
      value = require_numeric!(data, key, path: path)
      raise ValidationError.new("#{key} must be greater than 0", path: child_path(path, key)) unless value.positive?
    end

    def validate_range!(data, shape, path:)
      return unless shape_needs_target?(shape)
      validate_float_or_range!(require_key!(data, "range", path: path), path: child_path(path, "range"))
    end

    def shape_needs_target?(shape)
      shape["at"] == "target" || (%w[line cone].include?(shape["type"]) && shape["direction"] == TARGET_DIRECTION)
    end

    def validate_tick_effects!(data, path:)
      effects_path = child_path(path, "onTick")
      effects = require_array!(data, "onTick", path: path, min: 1)
      effects.each_with_index { |effect, i| AreaTickEffectValidator.validate!(effect, path: index_path(effects_path, i)) }
    end
  end
end
