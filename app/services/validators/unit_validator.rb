module Validators
  class UnitValidator < Base
    HOSTILITY_OPTIONS = %w[hostile neutral friendly].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      validate_core_fields!(data, path: path)
      validate_hp_fraction!(data, path: path) if given?(data, "currentHpFraction")
      UnitMovementValidator.validate!(data["movement"], path: child_path(path, "movement")) if given?(data, "movement")
      validate_group_identifier!(data, path: path) if given?(data, "groupIdentifier")
      RespawnConfigValidator.validate!(data["respawn"], path: child_path(path, "respawn")) if given?(data, "respawn")
    end

    private

    def validate_core_fields!(data, path:)
      require_string!(data, "identifier", path: path)
      require_string!(data, "unitType", path: path)
      validate_position!(require_hash!(data, "position", path: path), path: child_path(path, "position"))
      hostility = require_string!(data, "hostility", path: path)
      require_one_of!(hostility, HOSTILITY_OPTIONS, path: child_path(path, "hostility"))
    end

    def validate_hp_fraction!(data, path:)
      frac = data["currentHpFraction"]
      return if frac.is_a?(Numeric) && frac.between?(0.0, 1.0)
      raise ValidationError.new("currentHpFraction must be a number between 0.0 and 1.0", path: child_path(path, "currentHpFraction"))
    end

    # See docs/schema/unit.md - the game server groups every unit on the
    # same map sharing this value for aggro purposes.
    def validate_group_identifier!(data, path:)
      group_identifier = data["groupIdentifier"]
      raise ValidationError.new("groupIdentifier must be a string", path: child_path(path, "groupIdentifier")) unless group_identifier.is_a?(String)
    end
  end
end
