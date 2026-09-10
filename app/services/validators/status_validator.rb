module Validators
  class StatusValidator < Base
    TREAT_AS_OPTIONS = %w[buff debuff inherent].freeze
    STACKING_OPTIONS = %w[extend replace stack].freeze
    SHORT_NAME_MAX_LENGTH = 6

    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "name", path: path)
      require_string!(data, "description", path: path) if given?(data, "description")
      validate_short_name!(data, path: path)
      validate_treat_as!(data, path: path)
      validate_stacking!(data, path: path)
      validate_max_stacks!(data, path: path) if given?(data, "maxStacks")
      validate_aura_effect!(data, path: path) if given?(data, "auraEffect")
      validate_effects!(data, path: path)
    end

    private

    def validate_treat_as!(data, path:)
      treat_as = require_string!(data, "treatAs", path: path)
      require_one_of!(treat_as, TREAT_AS_OPTIONS, path: child_path(path, "treatAs"))
    end

    def validate_stacking!(data, path:)
      stacking = require_string!(data, "stacking", path: path)
      require_one_of!(stacking, STACKING_OPTIONS, path: child_path(path, "stacking"))
    end

    def validate_aura_effect!(data, path:)
      AuraEffectValidator.validate!(data["auraEffect"], path: child_path(path, "auraEffect"))
    end

    def validate_short_name!(data, path:)
      short_name = require_string!(data, "shortName", path: path)
      return if short_name.length <= SHORT_NAME_MAX_LENGTH
      raise ValidationError.new("shortName must be #{SHORT_NAME_MAX_LENGTH} characters or fewer", path: child_path(path, "shortName"))
    end

    def validate_max_stacks!(data, path:)
      max_stacks = data["maxStacks"]
      return if max_stacks.is_a?(Integer) && max_stacks >= 1
      raise ValidationError.new("maxStacks must be an integer >= 1", path: child_path(path, "maxStacks"))
    end

    def validate_effects!(data, path:)
      effects = require_array!(data, "effects", path: path)
      effects.each_with_index do |effect, i|
        StatusEffectValidator.validate!(effect, path: index_path(child_path(path, "effects"), i))
      end
    end
  end
end
