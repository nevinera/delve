module Validators
  class StatusValidator < Base
    TREAT_AS_OPTIONS = %w[buff debuff inherent].freeze
    STACKING_OPTIONS = %w[extend replace stack].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "name", path: path)
      treat_as = require_string!(data, "treatAs", path: path)
      require_one_of!(treat_as, TREAT_AS_OPTIONS, path: child_path(path, "treatAs"))
      stacking = require_string!(data, "stacking", path: path)
      require_one_of!(stacking, STACKING_OPTIONS, path: child_path(path, "stacking"))
      validate_max_stacks!(data, path: path) if data.key?("maxStacks")
      validate_effects!(data, path: path)
    end

    private

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
