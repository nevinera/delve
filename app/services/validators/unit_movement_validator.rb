module Validators
  # A unit's or NCU's `movement` (docs/schema/unit.md#unitmovement).
  class UnitMovementValidator < Base
    MOVEMENT_TYPES = %w[still patrol wander].freeze
    PATROL_CHOOSE_OPTIONS = %w[return loop random].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, MOVEMENT_TYPES, path: child_path(path, "type"))
      case type
      when "patrol" then validate_patrol_movement!(data, path: path)
      when "wander" then validate_wander_movement!(data, path: path)
      end
    end

    private

    def validate_patrol_movement!(data, path:)
      choose = require_string!(data, "choose", path: path)
      require_one_of!(choose, PATROL_CHOOSE_OPTIONS, path: child_path(path, "choose"))
      steps = require_array!(data, "steps", path: path, min: 2)
      steps.each_with_index do |step, i|
        validate_patrol_step!(step, path: index_path(child_path(path, "steps"), i))
      end
    end

    def validate_patrol_step!(step, path:)
      require_object!(step, path: path)
      validate_position!(require_hash!(step, "position", path: path), path: child_path(path, "position"))
      validate_patrol_step_rate!(require_numeric!(step, "movementRate", path: path), path: child_path(path, "movementRate"))
      validate_patrol_step_wait!(step, path: path)
    end

    def validate_patrol_step_rate!(rate, path:)
      raise ValidationError.new("movementRate must be between 0.0 and 1.0", path: path) unless rate.between?(0.0, 1.0)
    end

    def validate_patrol_step_wait!(step, path:)
      wait_path = child_path(path, "waitTime")
      raise ValidationError.new("waitTime is required", path: wait_path) unless step.key?("waitTime")
      wait = step["waitTime"]
      validate_float_or_range!(wait, path: wait_path)
      raise ValidationError.new("waitTime must be non-negative", path: wait_path) if wait.is_a?(Numeric) && wait < 0
    end

    def validate_wander_movement!(data, path:)
      validate_location!(require_hash!(data, "location", path: path), path: child_path(path, "location"))
      require_numeric!(data, "radius", path: path)
      validate_float_or_range!(require_key!(data, "speed", path: path), path: child_path(path, "speed"))
      validate_float_or_range!(require_key!(data, "waitTime", path: path), path: child_path(path, "waitTime"))
    end
  end
end
