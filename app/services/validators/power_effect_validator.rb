module Validators
  class PowerEffectValidator < Base
    TYPE_OPTIONS = %w[harm heal resource status groundArea].freeze
    AFFECTS_OPTIONS = %w[bTarget gTarget bAll gAll self].freeze
    HARM_AFFECTS_OPTIONS = %w[bTarget gTarget bAll gAll].freeze
    DAMAGE_SCHOOLS = %w[physical magic].freeze
    # A radius splashes around the target, so it needs one.
    RADIUS_AFFECTS_OPTIONS = %w[bTarget gTarget].freeze
    # An instant effect with a shape lands on everyone in it, on one side.
    SHAPED_AFFECTS_OPTIONS = %w[bAll gAll].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, TYPE_OPTIONS, path: child_path(path, "type"))
      validate_tags!(data, path: path) if given?(data, "tags")

      case type
      when "harm" then validate_harm!(data, path: path)
      when "heal" then validate_heal!(data, path: path)
      when "resource" then validate_resource!(data, path: path)
      when "status" then validate_status!(data, path: path)
      when "groundArea" then GroundAreaValidator.validate!(data, path: path)
      end
      validate_optional_area!(data, type, path: path)
    end

    private

    def validate_optional_area!(data, type, path:)
      validate_radius!(data, path: path) if given?(data, "radius")
      validate_shape!(data, path: path) if given?(data, "shape") && type != "groundArea"
    end

    def validate_shape!(data, path:)
      require_one_of!(data["affects"], SHAPED_AFFECTS_OPTIONS, path: child_path(path, "affects"))
      AreaShapeValidator.validate!(require_hash!(data, "shape", path: path), path: child_path(path, "shape"))
    end

    # A shaped effect needs a range only when its shape is anchored on, or
    # aimed at, the target.
    def range_required?(data)
      return data["affects"] != "self" unless data["shape"].is_a?(Hash)
      AreaShapeValidator.needs_target?(data["shape"])
    end

    def validate_harm!(data, path:)
      affects = require_string!(data, "affects", path: path)
      require_one_of!(affects, HARM_AFFECTS_OPTIONS, path: child_path(path, "affects"))
      amount = require_key!(data, "amount", path: path)
      validate_float_or_range!(amount, path: child_path(path, "amount"))
      if range_required?(data)
        range_val = require_key!(data, "range", path: path)
        validate_float_or_range!(range_val, path: child_path(path, "range"))
      end
      validate_school!(data, path: path) if given?(data, "school")
    end

    def validate_radius!(data, path:)
      radius = require_numeric!(data, "radius", path: path)
      raise ValidationError.new("radius must be greater than 0", path: child_path(path, "radius")) unless radius.positive?
      return if RADIUS_AFFECTS_OPTIONS.include?(data["affects"])
      raise ValidationError.new("radius only applies to bTarget and gTarget effects", path: child_path(path, "radius"))
    end

    def validate_school!(data, path:)
      school = require_string!(data, "school", path: path)
      require_one_of!(school, DAMAGE_SCHOOLS, path: child_path(path, "school"))
    end

    def validate_heal!(data, path:)
      affects = require_string!(data, "affects", path: path)
      require_one_of!(affects, AFFECTS_OPTIONS, path: child_path(path, "affects"))
      amount = require_key!(data, "amount", path: path)
      validate_float_or_range!(amount, path: child_path(path, "amount"))
      if range_required?(data)
        range_val = require_key!(data, "range", path: path)
        validate_float_or_range!(range_val, path: child_path(path, "range"))
      end
    end

    def validate_resource!(data, path:)
      affects = require_string!(data, "affects", path: path)
      require_one_of!(affects, AFFECTS_OPTIONS, path: child_path(path, "affects"))
      require_string!(data, "resourceName", path: path)
      require_numeric!(data, "delta", path: path)
      if range_required?(data)
        range_val = require_key!(data, "range", path: path)
        validate_float_or_range!(range_val, path: child_path(path, "range"))
      end
    end

    def validate_status!(data, path:)
      affects = require_string!(data, "affects", path: path)
      require_one_of!(affects, AFFECTS_OPTIONS, path: child_path(path, "affects"))
      require_numeric!(data, "duration", path: path)
      status_data = require_hash!(data, "status", path: path)
      StatusValidator.validate!(status_data, path: child_path(path, "status"))
      if range_required?(data)
        range_val = require_key!(data, "range", path: path)
        validate_float_or_range!(range_val, path: child_path(path, "range"))
      end
    end
  end
end
