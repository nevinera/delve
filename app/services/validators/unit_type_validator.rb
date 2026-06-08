module Validators
  class UnitTypeValidator < Base
    TARGETING_TYPES = %w[aggroTable nearest healerAggro].freeze
    TACTICS_TYPES = %w[randomAvailable rotation priorityRotation scripted phased].freeze
    PATROL_TACTICS_TYPES = (TACTICS_TYPES - ["phased"]).freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "name", path: path)

      token_url = require_key!(data, "tokenImageUrl", path: path)
      unless token_url.is_a?(String) || (token_url.is_a?(Array) && token_url.all? { |u| u.is_a?(String) })
        raise ValidationError.new("tokenImageUrl must be a string or array of strings", path: child_path(path, "tokenImageUrl"))
      end

      radius = require_numeric!(data, "tokenRadius", path: path)
      unless radius >= 1.0 && radius <= 20.0
        raise ValidationError.new("tokenRadius must be between 1.0 and 20.0", path: child_path(path, "tokenRadius"))
      end

      if data.key?("speedFactor")
        speed = data["speedFactor"]
        raise ValidationError.new("speedFactor must be a number", path: child_path(path, "speedFactor")) unless speed.is_a?(Numeric)
        unless speed >= 0.0 && speed <= 10.0
          raise ValidationError.new("speedFactor must be between 0.0 and 10.0", path: child_path(path, "speedFactor"))
        end
      end

      require_integer!(data, "maxHP", path: path)

      resource = require_hash!(data, "resource", path: path)
      ResourceTypeValidator.validate!(resource, path: child_path(path, "resource"))

      if data.key?("powers")
        powers = data["powers"]
        raise ValidationError.new("powers must be an array", path: child_path(path, "powers")) unless powers.is_a?(Array)
        powers.each_with_index do |power, i|
          PowerValidator.validate!(power, path: index_path(child_path(path, "powers"), i))
        end
      end

      if data.key?("targeting")
        validate_targeting!(data["targeting"], path: child_path(path, "targeting"))
      end

      if data.key?("tactics")
        validate_tactics!(data["tactics"], path: child_path(path, "tactics"))
      end
    end

    private

    def validate_targeting!(data, path:)
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, TARGETING_TYPES, path: child_path(path, "type"))
    end

    def validate_tactics!(data, path:, allow_phased: true)
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      allowed = allow_phased ? TACTICS_TYPES : PATROL_TACTICS_TYPES
      require_one_of!(type, allowed, path: child_path(path, "type"))

      case type
      when "rotation", "priorityRotation"
        powers = require_array!(data, "powers", path: path, min: 1)
        powers.each_with_index do |p, i|
          unless p.is_a?(String)
            raise ValidationError.new("power name must be a string", path: index_path(child_path(path, "powers"), i))
          end
        end
      when "scripted"
        require_numeric!(data, "duration", path: path)
        events = require_array!(data, "events", path: path)
        events.each_with_index do |event, i|
          event_path = index_path(child_path(path, "events"), i)
          require_object!(event, path: event_path)
          require_string!(event, "power", path: event_path)
          require_numeric!(event, "at", path: event_path)
        end
      when "phased"
        phases = require_array!(data, "phases", path: path, min: 2)
        phases.each_with_index do |phase, i|
          phase_path = index_path(child_path(path, "phases"), i)
          require_object!(phase, path: phase_path)
          tactics_data = require_hash!(phase, "tactics", path: phase_path)
          validate_tactics!(tactics_data, path: child_path(phase_path, "tactics"), allow_phased: false)
          next if i == phases.length - 1
          transition = require_hash!(phase, "transition", path: phase_path)
          validate_phase_transition!(transition, path: child_path(phase_path, "transition"))
        end
      end
    end

    def validate_phase_transition!(data, path:)
      require_object!(data, path: path)
      has_time = data.key?("timeElapsed")
      has_health = data.key?("healthBelow")
      unless has_time || has_health
        raise ValidationError.new("transition must specify timeElapsed or healthBelow", path: path)
      end
      if has_time
        val = data["timeElapsed"]
        raise ValidationError.new("timeElapsed must be a number", path: child_path(path, "timeElapsed")) unless val.is_a?(Numeric)
      end
      if has_health
        val = data["healthBelow"]
        unless val.is_a?(Numeric) && val >= 0.0 && val <= 1.0
          raise ValidationError.new("healthBelow must be a number between 0.0 and 1.0", path: child_path(path, "healthBelow"))
        end
      end
    end
  end
end
