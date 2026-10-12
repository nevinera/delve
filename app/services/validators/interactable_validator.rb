module Validators
  # A quest interactable (docs/schema/map.md#interactable): an image on a
  # map a player uses for a quest's `use` objective.
  class InteractableValidator < Base
    WHEN_UNAVAILABLE = %w[hidden used].freeze
    SIZE_RANGE = 0.5..40.0
    MAX_USE_TIME = 30.0
    MAX_USE_TEXT = 40

    def validate!(data, path: "$")
      require_object!(data, path: path)
      %w[identifier name imageUrl].each { |key| require_non_empty_string!(data, key, path: path) }
      validate_unavailable!(data, path: path)
      validate_size!(require_hash!(data, "size", path: path), path: child_path(path, "size"))
      validate_position!(require_hash!(data, "position", path: path), path: child_path(path, "position"))
      validate_use!(data, path: path)
      AnnotationsValidator.validate_on!(data, path: path)
    end

    private

    def validate_unavailable!(data, path:)
      require_non_empty_string!(data, "usedImageUrl", path: path) if given?(data, "usedImageUrl")
      return unless given?(data, "whenUnavailable")
      require_one_of!(require_string!(data, "whenUnavailable", path: path), WHEN_UNAVAILABLE, path: child_path(path, "whenUnavailable"))
      return unless data["whenUnavailable"] == "used" && !given?(data, "usedImageUrl")
      raise ValidationError.new("usedImageUrl is required when whenUnavailable is \"used\"", path: path)
    end

    def validate_size!(size, path:)
      %w[width height].each do |key|
        value = require_numeric!(size, key, path: path)
        next if SIZE_RANGE.cover?(value)
        raise ValidationError.new("#{key} must be between #{SIZE_RANGE.min} and #{SIZE_RANGE.max}", path: child_path(path, key))
      end
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
