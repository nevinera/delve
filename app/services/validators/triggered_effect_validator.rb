module Validators
  # A StatusEffect{type: "triggered"}'s effect (docs/schema/status.md) -
  # deliberately smaller than PowerEffect: no range/LOS check (it's reactive,
  # firing from combat that's already happening, not a fresh cast), and
  # affects is restricted to "self" or "target" (the trigger holder's own
  # current target) rather than PowerEffect's full bTarget/gTarget/bAll/gAll
  # vocabulary.
  class TriggeredEffectValidator < Base
    TYPE_OPTIONS = %w[harm heal resource status].freeze
    AFFECTS_OPTIONS = %w[self target].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, TYPE_OPTIONS, path: child_path(path, "type"))
      validate_affects!(data, path: path)

      case type
      when "harm" then validate_harm!(data, path: path)
      when "heal" then validate_heal!(data, path: path)
      when "resource" then validate_resource!(data, path: path)
      when "status" then validate_status!(data, path: path)
      end
    end

    private

    def validate_affects!(data, path:)
      affects = require_string!(data, "affects", path: path)
      require_one_of!(affects, AFFECTS_OPTIONS, path: child_path(path, "affects"))
    end

    def validate_harm!(data, path:)
      amount = require_key!(data, "amount", path: path)
      validate_float_or_range!(amount, path: child_path(path, "amount"))
      validate_school!(data, path: path) if given?(data, "school")
    end

    def validate_school!(data, path:)
      school = require_string!(data, "school", path: path)
      require_one_of!(school, PowerEffectValidator::DAMAGE_SCHOOLS, path: child_path(path, "school"))
    end

    def validate_heal!(data, path:)
      amount = require_key!(data, "amount", path: path)
      validate_float_or_range!(amount, path: child_path(path, "amount"))
    end

    def validate_resource!(data, path:)
      require_string!(data, "resourceName", path: path)
      require_numeric!(data, "delta", path: path)
    end

    def validate_status!(data, path:)
      require_numeric!(data, "duration", path: path)
      status_data = require_hash!(data, "status", path: path)
      StatusValidator.validate!(status_data, path: child_path(path, "status"))
    end
  end
end
