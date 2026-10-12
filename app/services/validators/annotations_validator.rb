module Validators
  # An `annotations` object (docs/schema/common.md#annotations): notes for an
  # LLM, kept between the steps of building a world, on worlds, zones, maps,
  # places, unit types, units, quests and NCUs alike. Nothing reads them at
  # runtime, and they're never copied into game state.
  class AnnotationsValidator < Base
    MAX_ANNOTATIONS = 32
    MAX_TEXT = 4000
    KEY_RE = /\A[a-z][a-z0-9_-]{0,39}\z/

    # Validates data["annotations"], when given.
    def self.validate_on!(data, path:)
      validate!(data["annotations"], path: Helpers.child_path(path, "annotations")) if Helpers.given?(data, "annotations")
    end

    def validate!(annotations, path: "$")
      raise ValidationError.new("must be an object", path: path) unless annotations.is_a?(Hash)
      raise ValidationError.new("has more than #{MAX_ANNOTATIONS} annotations", path: path) if annotations.length > MAX_ANNOTATIONS
      annotations.each { |key, value| validate_annotation!(key, value, path: child_path(path, key)) }
    end

    private

    def validate_annotation!(key, value, path:)
      raise ValidationError.new("keys must be lowercase words (letters, digits, - and _), at most 40 characters", path: path) unless KEY_RE.match?(key)
      raise ValidationError.new("must be a string of #{MAX_TEXT} characters or fewer", path: path) unless value.is_a?(String) && value.length <= MAX_TEXT
    end
  end
end
