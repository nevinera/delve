module Validators
  class StatusEffectValidator < Base
    TYPE_OPTIONS = %w[stat recurring none].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, TYPE_OPTIONS, path: child_path(path, "type"))

      case type
      when "stat"
        require_string!(data, "statName", path: path)
        modifier_type = require_string!(data, "modifierType", path: path)
        require_one_of!(modifier_type, %w[multiply add], path: child_path(path, "modifierType"))
        require_numeric!(data, "amount", path: path)
      when "recurring"
        require_numeric!(data, "tickRate", path: path)
        on_tick = require_string!(data, "onTick", path: path)
        require_one_of!(on_tick, %w[heal harm], path: child_path(path, "onTick"))
        require_numeric!(data, "amount", path: path)
      end
    end
  end
end
