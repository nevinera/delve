module Validators
  class UnitTypeValidator < Base
    TARGETING_TYPES = %w[aggroTable nearest healerAggro].freeze
    BASIC_ATTACK_SCHOOLS = %w[physical magic].freeze
    BASIC_ATTACK_STYLES = %w[claw sword axe club arrow arcane ice nature fire].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      validate_fixed_fields!(data, path: path)
      validate_optional_fields!(data, path: path)
      validate_powers!(data, path: path) if given?(data, "powers")
      validate_targeting!(data["targeting"], path: child_path(path, "targeting")) if given?(data, "targeting")
      if given?(data, "tactics")
        UnitTacticsValidator.validate!(data["tactics"], known_power_names: known_power_names(data), path: child_path(path, "tactics"))
      end
    end

    private

    def validate_optional_fields!(data, path:)
      validate_speed_factor!(data, path: path) if given?(data, "speedFactor")
      validate_positive_numeric!(data, "basicAttackRange", path: path) if given?(data, "basicAttackRange")
      validate_basic_attack_school!(data, path: path) if given?(data, "basicAttackSchool")
      validate_basic_attack_style!(data, path: path) if given?(data, "basicAttackStyle")
    end

    def validate_fixed_fields!(data, path:)
      require_string!(data, "name", path: path)
      validate_token_image_url!(data, path: path)
      validate_token_radius!(data, path: path)
      require_integer!(data, "maxHP", path: path)
      validate_positive_numeric!(data, "dps", path: path)
      validate_positive_numeric!(data, "attackSpeed", path: path)
      ResourceTypeValidator.validate!(require_hash!(data, "resource", path: path), path: child_path(path, "resource"))
    end

    def validate_basic_attack_school!(data, path:)
      school = require_string!(data, "basicAttackSchool", path: path)
      require_one_of!(school, BASIC_ATTACK_SCHOOLS, path: child_path(path, "basicAttackSchool"))
    end

    def validate_basic_attack_style!(data, path:)
      style = require_string!(data, "basicAttackStyle", path: path)
      require_one_of!(style, BASIC_ATTACK_STYLES, path: child_path(path, "basicAttackStyle"))
    end

    def validate_positive_numeric!(data, key, path:)
      value = require_numeric!(data, key, path: path)
      return if value.positive?
      raise ValidationError.new("#{key} must be greater than 0", path: child_path(path, key))
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
        AbilityValidator.validate!(power, path: index_path(child_path(path, "powers"), i))
      end
    end

    def validate_targeting!(data, path:)
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, TARGETING_TYPES, path: child_path(path, "type"))
    end

    def known_power_names(data)
      powers = data["powers"]
      return [] unless powers.is_a?(Array)
      powers.filter_map { |p| p["name"] if p.is_a?(Hash) }
    end
  end
end
