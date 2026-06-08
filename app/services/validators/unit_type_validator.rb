module Validators
  class UnitTypeValidator < Base
    TARGETING_TYPES = %w[aggroTable nearest healerAggro].freeze
    TACTICS_TYPES = %w[randomAvailable rotation priorityRotation scripted phased].freeze
    PATROL_TACTICS_TYPES = (TACTICS_TYPES - ["phased"]).freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      validate_fixed_fields!(data, path: path)
      validate_speed_factor!(data, path: path) if data.key?("speedFactor")
      validate_powers!(data, path: path) if data.key?("powers")
      validate_targeting!(data["targeting"], path: child_path(path, "targeting")) if data.key?("targeting")
      validate_tactics!(data["tactics"], path: child_path(path, "tactics")) if data.key?("tactics")
    end

    private

    def validate_fixed_fields!(data, path:)
      require_string!(data, "name", path: path)
      validate_token_image_url!(data, path: path)
      validate_token_radius!(data, path: path)
      require_integer!(data, "maxHP", path: path)
      ResourceTypeValidator.validate!(require_hash!(data, "resource", path: path), path: child_path(path, "resource"))
    end

    def valid_token_image_url?(value)
      value.is_a?(String) || (value.is_a?(Array) && value.all? { |u| u.is_a?(String) })
    end

    def validate_token_image_url!(data, path:)
      token_url = require_key!(data, "tokenImageUrl", path: path)
      return if valid_token_image_url?(token_url)
      raise ValidationError.new("tokenImageUrl must be a string or array of strings", path: child_path(path, "tokenImageUrl"))
    end

    def validate_token_radius!(data, path:)
      radius = require_numeric!(data, "tokenRadius", path: path)
      return if radius.between?(1.0, 20.0)
      raise ValidationError.new("tokenRadius must be between 1.0 and 20.0", path: child_path(path, "tokenRadius"))
    end

    def validate_speed_factor!(data, path:)
      speed = data["speedFactor"]
      raise ValidationError.new("speedFactor must be a number", path: child_path(path, "speedFactor")) unless speed.is_a?(Numeric)
      return if speed.between?(0.0, 10.0)
      raise ValidationError.new("speedFactor must be between 0.0 and 10.0", path: child_path(path, "speedFactor"))
    end

    def validate_powers!(data, path:)
      powers = data["powers"]
      raise ValidationError.new("powers must be an array", path: child_path(path, "powers")) unless powers.is_a?(Array)
      powers.each_with_index do |power, i|
        PowerValidator.validate!(power, path: index_path(child_path(path, "powers"), i))
      end
    end

    def validate_targeting!(data, path:)
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, TARGETING_TYPES, path: child_path(path, "type"))
    end

    def validate_tactics!(data, path:, allow_phased: true)
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, allow_phased ? TACTICS_TYPES : PATROL_TACTICS_TYPES, path: child_path(path, "type"))

      case type
      when "rotation", "priorityRotation" then validate_rotation_tactics!(data, path: path)
      when "scripted" then validate_scripted_tactics!(data, path: path)
      when "phased" then validate_phased_tactics!(data, path: path)
      end
    end

    def validate_rotation_tactics!(data, path:)
      powers = require_array!(data, "powers", path: path, min: 1)
      powers.each_with_index do |p, i|
        raise ValidationError.new("power name must be a string", path: index_path(child_path(path, "powers"), i)) unless p.is_a?(String)
      end
    end

    def validate_scripted_tactics!(data, path:)
      require_numeric!(data, "duration", path: path)
      events = require_array!(data, "events", path: path)
      events.each_with_index do |event, i|
        event_path = index_path(child_path(path, "events"), i)
        require_object!(event, path: event_path)
        require_string!(event, "power", path: event_path)
        require_numeric!(event, "at", path: event_path)
      end
    end

    def validate_phased_tactics!(data, path:)
      phases = require_array!(data, "phases", path: path, min: 2)
      phases.each_with_index do |phase, i|
        phase_path = index_path(child_path(path, "phases"), i)
        require_object!(phase, path: phase_path)
        validate_tactics!(require_hash!(phase, "tactics", path: phase_path), path: child_path(phase_path, "tactics"), allow_phased: false)
        next if i == phases.length - 1
        validate_phase_transition!(require_hash!(phase, "transition", path: phase_path), path: child_path(phase_path, "transition"))
      end
    end

    def validate_phase_transition!(data, path:)
      require_object!(data, path: path)
      has_time = data.key?("timeElapsed")
      has_health = data.key?("healthBelow")
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
  end
end
