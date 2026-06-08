module Validators
  class UnitValidator < Base
    HOSTILITY_OPTIONS = %w[hostile neutral friendly].freeze
    MOVEMENT_TYPES = %w[still patrol wander].freeze
    PATROL_CHOOSE_OPTIONS = %w[return loop random].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "unitType", path: path)

      position = require_hash!(data, "position", path: path)
      validate_position!(position, path: child_path(path, "position"))

      hostility = require_string!(data, "hostility", path: path)
      require_one_of!(hostility, HOSTILITY_OPTIONS, path: child_path(path, "hostility"))

      if data.key?("currentHpFraction")
        frac = data["currentHpFraction"]
        unless frac.is_a?(Numeric) && frac >= 0.0 && frac <= 1.0
          raise ValidationError.new("currentHpFraction must be a number between 0.0 and 1.0", path: child_path(path, "currentHpFraction"))
        end
      end

      if data.key?("movement")
        validate_movement!(data["movement"], path: child_path(path, "movement"))
      end

      if data.key?("links")
        links = data["links"]
        raise ValidationError.new("links must be an array", path: child_path(path, "links")) unless links.is_a?(Array)
        links.each_with_index do |link, i|
          unless link.is_a?(String)
            raise ValidationError.new("link must be a string", path: index_path(child_path(path, "links"), i))
          end
        end
      end
    end

    private

    def validate_movement!(data, path:)
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, MOVEMENT_TYPES, path: child_path(path, "type"))

      case type
      when "patrol"
        choose = require_string!(data, "choose", path: path)
        require_one_of!(choose, PATROL_CHOOSE_OPTIONS, path: child_path(path, "choose"))
        steps = require_array!(data, "steps", path: path, min: 2)
        steps.each_with_index do |step, i|
          step_path = index_path(child_path(path, "steps"), i)
          require_object!(step, path: step_path)
          position = require_hash!(step, "position", path: step_path)
          validate_position!(position, path: child_path(step_path, "position"))
          rate = require_numeric!(step, "movementRate", path: step_path)
          unless rate >= 0.0 && rate <= 1.0
            raise ValidationError.new("movementRate must be between 0.0 and 1.0", path: child_path(step_path, "movementRate"))
          end
          wait_path = child_path(step_path, "waitTime")
          raise ValidationError.new("waitTime is required", path: wait_path) unless step.key?("waitTime")
          wait = step["waitTime"]
          validate_float_or_range!(wait, path: wait_path)
          if wait.is_a?(Numeric)
            raise ValidationError.new("waitTime must be non-negative", path: wait_path) unless wait >= 0
          end
        end
      when "wander"
        location = require_hash!(data, "location", path: path)
        validate_location!(location, path: child_path(path, "location"))
        require_numeric!(data, "radius", path: path)
        speed = require_key!(data, "speed", path: path)
        validate_float_or_range!(speed, path: child_path(path, "speed"))
        wait_time = require_key!(data, "waitTime", path: path)
        validate_float_or_range!(wait_time, path: child_path(path, "waitTime"))
      end
    end
  end
end
