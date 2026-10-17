module Validators
  # The shape of a groundArea effect, or of an instant effect that lands in one.
  class AreaShapeValidator < Base
    TYPES = %w[circle ring line cone].freeze
    ANCHORS = %w[self target].freeze
    DIRECTIONS = %w[target facing].freeze

    # Whether the shape is anchored on, or aimed at, the caster's target.
    def self.needs_target?(shape)
      shape["at"] == "target" || (%w[line cone].include?(shape["type"]) && shape["direction"] == "target")
    end

    def validate!(shape, path: "$")
      type = require_string!(shape, "type", path: path)
      require_one_of!(type, TYPES, path: child_path(path, "type"))
      case type
      when "circle" then validate_circle!(shape, path: path)
      when "ring" then validate_ring!(shape, path: path)
      else validate_long_shape!(shape, type, path: path)
      end
    end

    private

    def validate_circle!(shape, path:)
      validate_anchor!(shape, path: path)
      positive!(shape, "radius", path: path)
    end

    def validate_ring!(shape, path:)
      validate_anchor!(shape, path: path)
      inner = require_numeric!(shape, "innerRadius", path: path)
      raise ValidationError.new("innerRadius must be 0 or more", path: child_path(path, "innerRadius")) if inner.negative?
      outer = require_numeric!(shape, "outerRadius", path: path)
      raise ValidationError.new("outerRadius must be greater than innerRadius", path: child_path(path, "outerRadius")) unless outer > inner
    end

    def validate_long_shape!(shape, type, path:)
      validate_direction!(shape, path: path)
      positive!(shape, "length", path: path)
      positive!(shape, "width", path: path)
      validate_offset!(shape, path: path) if type == "cone" && given?(shape, "offset")
    end

    def validate_offset!(shape, path:)
      offset = require_numeric!(shape, "offset", path: path)
      raise ValidationError.new("offset must be 0 or more", path: child_path(path, "offset")) if offset.negative?
      raise ValidationError.new("offset must be less than length", path: child_path(path, "offset")) unless offset < shape["length"]
    end

    def validate_anchor!(shape, path:)
      require_one_of!(require_string!(shape, "at", path: path), ANCHORS, path: child_path(path, "at"))
    end

    def validate_direction!(shape, path:)
      return unless given?(shape, "direction")
      require_one_of!(require_string!(shape, "direction", path: path), DIRECTIONS, path: child_path(path, "direction"))
    end

    def positive!(data, key, path:)
      value = require_numeric!(data, key, path: path)
      raise ValidationError.new("#{key} must be greater than 0", path: child_path(path, key)) unless value.positive?
    end
  end
end
