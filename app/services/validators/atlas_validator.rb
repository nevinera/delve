module Validators
  # A world's atlas (docs/schema/world.md#atlas): where its zones' maps sit
  # geographically, for the in-game map. Checks the shape only: every zone
  # outline a simple polygon, every map a location, every bend a link's
  # two ends and a location. WorldReferences checks it against the zones
  # (that maps fit their zone, and nothing overlaps).
  class AtlasValidator < Base
    MAX_OUTLINE_POINTS = 64
    END_RE = %r{[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+}
    BEND_KEY_RE = /\A#{END_RE}\|#{END_RE}\z/

    def validate!(data, path: "$")
      require_object!(data, path: path)
      zones = require_hash!(data, "zones", path: path)
      zones_path = child_path(path, "zones")
      zones.each { |key, zone| validate_zone!(zone, path: child_path(zones_path, key)) }
      validate_bends!(data, path: path) if given?(data, "bends")
    end

    private

    def validate_zone!(zone, path:)
      require_object!(zone, path: path)
      validate_outline!(zone, path: path)
      maps = require_hash!(zone, "maps", path: path)
      maps.each { |key, location| validate_location!(location, path: child_path(child_path(path, "maps"), key)) }
    end

    def validate_outline!(zone, path:)
      outline = require_array!(zone, "outline", path: path)
      outline_path = child_path(path, "outline")
      validate_outline_length!(outline, path: outline_path)
      outline.each_with_index { |point, i| validate_location!(point, path: index_path(outline_path, i)) }
      return if AtlasGeometry.simple_polygon?(outline.map { |p| [p["x"], p["y"]] })
      raise ValidationError.new("outline must not cross itself or be flat", path: outline_path)
    end

    def validate_outline_length!(outline, path:)
      return if outline.length.between?(3, MAX_OUTLINE_POINTS)
      raise ValidationError.new("outline must have 3 to #{MAX_OUTLINE_POINTS} points", path: path)
    end

    # Keyed by the link's two ends ("zone/map/connection", in sorted order,
    # joined by "|"); a bend for no link is ignored.
    def validate_bends!(data, path:)
      bends = require_hash!(data, "bends", path: path)
      bends_path = child_path(path, "bends")
      bends.each do |key, offset|
        raise ValidationError.new("bend key must be two zone/map/connection ends joined by |", path: child_path(bends_path, key)) unless BEND_KEY_RE.match?(key)
        validate_location!(offset, path: child_path(bends_path, key))
      end
    end
  end
end
