module Validators
  # A world's atlas (docs/schema/world.md#atlas): where its zones' maps sit
  # geographically, for the in-game map. Checks the shape only: every zone
  # outline a simple quadrilateral, every map a location. WorldReferences
  # checks it against the zones (that maps fit their zone, and nothing
  # overlaps).
  class AtlasValidator < Base
    def validate!(data, path: "$")
      require_object!(data, path: path)
      zones = require_hash!(data, "zones", path: path)
      zones_path = child_path(path, "zones")
      zones.each { |key, zone| validate_zone!(zone, path: child_path(zones_path, key)) }
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
      raise ValidationError.new("outline must have exactly 4 points", path: outline_path) unless outline.length == 4
      outline.each_with_index { |point, i| validate_location!(point, path: index_path(outline_path, i)) }
      return if AtlasGeometry.simple_quad?(outline.map { |p| [p["x"], p["y"]] })
      raise ValidationError.new("outline must not cross itself or be flat", path: outline_path)
    end
  end
end
