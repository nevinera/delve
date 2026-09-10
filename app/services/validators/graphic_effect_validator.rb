module Validators
  class GraphicEffectValidator < Base
    ORIGIN_OPTIONS = %w[self affected].freeze
    WHEN_OPTIONS = %w[immediate impact].freeze
    CONDITION_OPTIONS = %w[always onHit onMiss].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      validate_graphic_source_url!(data, path: path)
      validate_duration!(data, path: path)
      validate_from_field!(data, path: path)
      validate_to_field!(data, path: path) if data.key?("to")
      validate_when_field!(data, path: path)
      validate_condition_field!(data, path: path)
      validate_graphic_sprite_sheet!(data, path: path)
      validate_hex_color!(data, "color", path: path) if data.key?("color")
    end

    private

    # Required for a static effect (no "to") - there's nothing else to derive
    # a display duration from. A travelling effect's flight time is normally
    # computed client-side from the power's own `speed` instead, so duration
    # may be omitted there; if given anyway, it's still validated (used as a
    # fallback when the power has no `speed`).
    def validate_duration!(data, path:)
      return if data.key?("to") && !data.key?("duration")
      require_numeric!(data, "duration", path: path)
    end

    def validate_from_field!(data, path:)
      from = require_string!(data, "from", path: path)
      require_one_of!(from, ORIGIN_OPTIONS, path: child_path(path, "from"))
    end

    def validate_to_field!(data, path:)
      to = data["to"]
      raise ValidationError.new("to must be a string", path: child_path(path, "to")) unless to.is_a?(String)
      require_one_of!(to, ORIGIN_OPTIONS, path: child_path(path, "to"))
    end

    def validate_when_field!(data, path:)
      when_val = require_string!(data, "when", path: path)
      require_one_of!(when_val, WHEN_OPTIONS, path: child_path(path, "when"))
    end

    def validate_condition_field!(data, path:)
      condition = require_string!(data, "condition", path: path)
      require_one_of!(condition, CONDITION_OPTIONS, path: child_path(path, "condition"))
    end
  end
end
