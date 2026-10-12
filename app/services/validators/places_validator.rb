module Validators
  # A map's places (docs/schema/map.md#place): named, tagged areas, each a
  # polygon in map feet, for building a zone in layers. Only their shape is
  # checked: they needn't cover the map, and may overlap. The game server
  # ignores them, annotations most of all (see AnnotationsValidator).
  class PlacesValidator < Base
    MAX_PLACES = 200
    MAX_POINTS = 1000
    MAX_TEXT = 4000
    MAX_NAME = 80
    IDENTIFIER_RE = /\A[a-z0-9][a-z0-9_-]*\z/

    def validate!(places, path: "$")
      raise ValidationError.new("must be an array", path: path) unless places.is_a?(Array)
      raise ValidationError.new("has #{places.length} places, more than the maximum of #{MAX_PLACES}", path: path) if places.length > MAX_PLACES
      places.each_with_index { |place, i| validate_place!(place, path: index_path(path, i)) }
      validate_unique!(places, path: path)
    end

    private

    def validate_place!(place, path:)
      require_object!(place, path: path)
      validate_identifier!(place, path: path)
      validate_text!(place, "name", MAX_NAME, path: path) if given?(place, "name")
      validate_text!(place, "description", MAX_TEXT, path: path) if given?(place, "description")
      validate_tags!(place, path: path) if given?(place, "tags")
      validate_polygon!(place, path: path)
      AnnotationsValidator.validate_on!(place, path: path)
    end

    def validate_identifier!(place, path:)
      return if IDENTIFIER_RE.match?(require_string!(place, "identifier", path: path))
      raise ValidationError.new("must be lowercase letters, digits, - and _", path: child_path(path, "identifier"))
    end

    def validate_text!(place, key, max, path:)
      text = require_string!(place, key, path: path)
      raise ValidationError.new("must be #{max} characters or fewer", path: child_path(path, key)) if text.length > max
    end

    def validate_polygon!(place, path:)
      points = require_array!(place, "polygon", path: path, min: 3)
      list_path = child_path(path, "polygon")
      raise ValidationError.new("has #{points.length} points, more than the maximum of #{MAX_POINTS}", path: list_path) if points.length > MAX_POINTS
      points.each_with_index { |point, i| validate_location!(point, path: index_path(list_path, i)) }
    end

    def validate_unique!(places, path:)
      seen = places.map { |place| place["identifier"] }.tally.select { |_, n| n > 1 }.keys
      raise ValidationError.new("has more than one place named #{seen.first.inspect}", path: path) if seen.any?
    end
  end
end
