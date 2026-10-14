module Validators
  # A quest interactable (docs/schema/map.md#interactable): a stamp on a
  # map a player uses for a quest's `use` objective. Its stamps are the
  # zone's (StampReferences checks they exist).
  class InteractableValidator < Base
    WHEN_UNAVAILABLE = %w[hidden used].freeze
    STAMP_RE = StampPlacementsValidator::STAMP_RE
    MAX_SCALE = StampPlacementsValidator::MAX_SCALE
    GONE = {"imageUrl" => "stamp", "usedImageUrl" => "usedStamp", "size" => "scale"}.freeze
    MAX_USE_TIME = 30.0
    MAX_USE_TEXT = 40

    def validate!(data, path: "$")
      require_object!(data, path: path)
      %w[identifier name].each { |key| require_non_empty_string!(data, key, path: path) }
      reject_gone_fields!(data, path: path)
      validate_look!(data, path: path)
      validate_unavailable!(data, path: path)
      validate_position!(require_hash!(data, "position", path: path), path: child_path(path, "position"))
      validate_use!(data, path: path)
      AnnotationsValidator.validate_on!(data, path: path)
    end

    private

    # Interactables were images once; say what replaced each field.
    def reject_gone_fields!(data, path:)
      GONE.each do |old, new|
        raise ValidationError.new("#{old} is gone: interactables are drawn from the zone's stamps (#{new})", path: child_path(path, old)) if data.key?(old)
      end
    end

    def validate_look!(data, path:)
      validate_stamp!(data, "stamp", path: path)
      validate_stamp!(data, "usedStamp", path: path) if given?(data, "usedStamp")
      %w[variant usedVariant].each { |key| validate_variant!(data, key, path: path) if given?(data, key) }
      return unless given?(data, "scale")
      scale = require_numeric!(data, "scale", path: path)
      raise ValidationError.new("scale must be more than 0 and at most #{MAX_SCALE}", path: child_path(path, "scale")) unless scale > 0 && scale <= MAX_SCALE
    end

    def validate_stamp!(data, key, path:)
      return if STAMP_RE.match?(require_string!(data, key, path: path))
      raise ValidationError.new("#{key} must be set/stamp, like quest-props/goblin-snare", path: child_path(path, key))
    end

    def validate_variant!(data, key, path:)
      raise ValidationError.new("#{key} must be at least 0", path: child_path(path, key)) if require_integer!(data, key, path: path) < 0
    end

    # Once used: hidden, or drawn as used (from usedStamp, or its own stamp
    # grayed and faded without one).
    def validate_unavailable!(data, path:)
      return unless given?(data, "whenUnavailable")
      require_one_of!(require_string!(data, "whenUnavailable", path: path), WHEN_UNAVAILABLE, path: child_path(path, "whenUnavailable"))
    end

    def validate_use!(data, path:)
      if given?(data, "useTime")
        time = require_numeric!(data, "useTime", path: path)
        raise ValidationError.new("useTime must be between 0 and #{MAX_USE_TIME}", path: child_path(path, "useTime")) unless time.between?(0, MAX_USE_TIME)
      end
      return unless given?(data, "useText")
      text = require_non_empty_string!(data, "useText", path: path)
      raise ValidationError.new("useText must be #{MAX_USE_TEXT} characters or fewer", path: child_path(path, "useText")) if text.length > MAX_USE_TEXT
    end

    def require_non_empty_string!(data, key, path:)
      value = require_string!(data, key, path: path)
      raise ValidationError.new("#{key} must not be empty", path: child_path(path, key)) if value.strip.empty?
      value
    end
  end
end
