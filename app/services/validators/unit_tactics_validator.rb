module Validators
  # Validates a UnitType's `tactics` field, including the constraint that
  # every power name it references (rotation/priorityRotation lists,
  # scripted events, and phased sub-tactics) actually exists in the unit
  # type's own `powers` list - split out of UnitTypeValidator to keep both
  # classes under the repo's Metrics/ClassLength and AbcSize limits.
  class UnitTacticsValidator < Base
    TYPES = %w[randomAvailable rotation priorityRotation scripted phased].freeze
    PATROL_TYPES = (TYPES - ["phased"]).freeze

    def self.validate!(data, known_power_names:, path: "$", allow_phased: true)
      new.validate!(data, known_power_names: known_power_names, path: path, allow_phased: allow_phased)
    end

    def validate!(data, known_power_names:, path: "$", allow_phased: true)
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, allow_phased ? TYPES : PATROL_TYPES, path: child_path(path, "type"))

      case type
      when "rotation", "priorityRotation" then validate_rotation!(data, known_power_names, path: path)
      when "scripted" then validate_scripted!(data, known_power_names, path: path)
      when "phased" then validate_phased!(data, known_power_names, path: path)
      end
    end

    private

    def validate_rotation!(data, known_power_names, path:)
      powers = require_array!(data, "powers", path: path, min: 1)
      powers.each_with_index do |p, i|
        power_path = index_path(child_path(path, "powers"), i)
        raise ValidationError.new("power name must be a string", path: power_path) unless p.is_a?(String)
        check_power_name!(p, known_power_names, path: power_path)
      end
    end

    def validate_scripted!(data, known_power_names, path:)
      require_numeric!(data, "duration", path: path)
      events = require_array!(data, "events", path: path)
      events.each_with_index { |event, i| validate_scripted_event!(event, known_power_names, path: index_path(child_path(path, "events"), i)) }
    end

    def validate_scripted_event!(event, known_power_names, path:)
      require_object!(event, path: path)
      power = require_string!(event, "power", path: path)
      require_numeric!(event, "at", path: path)
      check_power_name!(power, known_power_names, path: child_path(path, "power"))
    end

    def validate_phased!(data, known_power_names, path:)
      phases = require_array!(data, "phases", path: path, min: 2)
      phases.each_with_index { |phase, i| validate_phase!(phase, known_power_names, path: index_path(child_path(path, "phases"), i), last: i == phases.length - 1) }
    end

    def validate_phase!(phase, known_power_names, path:, last:)
      require_object!(phase, path: path)
      validate!(require_hash!(phase, "tactics", path: path), known_power_names: known_power_names, path: child_path(path, "tactics"), allow_phased: false)
      return if last
      validate_transition!(require_hash!(phase, "transition", path: path), path: child_path(path, "transition"))
    end

    def validate_transition!(data, path:)
      require_object!(data, path: path)
      has_time = given?(data, "timeElapsed")
      has_health = given?(data, "healthBelow")
      raise ValidationError.new("transition must specify timeElapsed or healthBelow", path: path) unless has_time || has_health
      validate_time_elapsed!(data, path: path) if has_time
      validate_health_below!(data, path: path) if has_health
    end

    def validate_time_elapsed!(data, path:)
      val = data["timeElapsed"]
      raise ValidationError.new("timeElapsed must be a number", path: child_path(path, "timeElapsed")) unless val.is_a?(Numeric)
    end

    def validate_health_below!(data, path:)
      val = data["healthBelow"]
      return if val.is_a?(Numeric) && val.between?(0.0, 1.0)
      raise ValidationError.new("healthBelow must be a number between 0.0 and 1.0", path: child_path(path, "healthBelow"))
    end

    def check_power_name!(name, known_power_names, path:)
      return if known_power_names.include?(name)
      raise ValidationError.new("references power #{name.inspect}, which is not in this unit type's powers", path: path)
    end
  end
end
