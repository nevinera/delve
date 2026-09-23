module Validators
  class MapValidator < Base
    BARRIER_TYPES = %w[wall circle].freeze
    # Each wall contributes (locations.length - 1) segments; a circle is a
    # fixed 6 (see docs/schema/map.md#barrier and issue #45) - caps how much
    # collision/line-of-sight geometry the game server has to check per map.
    MAX_BARRIER_SEGMENTS = 3000
    CIRCLE_BARRIER_SEGMENTS = 6
    CONNECTION_TYPES = %w[point line].freeze
    LIGHTING_OPTIONS = %w[daylight torchlight].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      validate_fixed_fields!(data, path: path)
      validate_optional_fields!(data, path: path)
    end

    private

    def validate_optional_fields!(data, path:)
      validate_elvl!(data, path: path) if given?(data, "elvl")
      validate_lighting!(data, path: path) if given?(data, "lighting")
      require_string!(data, "thumbnailUrl", path: path) if given?(data, "thumbnailUrl")
      validate_barriers!(data, path: path) if given?(data, "barriers")
      validate_connections!(data, path: path) if given?(data, "connections")
      validate_units!(data, path: path) if given?(data, "units")
    end

    def validate_fixed_fields!(data, path:)
      require_string!(data, "identifier", path: path)
      require_string!(data, "name", path: path)
      require_string!(data, "imageUrl", path: path)
      validate_pixel_dimensions!(require_hash!(data, "pixelDimensions", path: path), path: child_path(path, "pixelDimensions"))
      validate_feet_dimensions!(require_hash!(data, "feetDimensions", path: path), path: child_path(path, "feetDimensions"))
    end

    def validate_elvl!(data, path:)
      elvl = require_integer!(data, "elvl", path: path)
      raise ValidationError.new("elvl must be at least 0", path: child_path(path, "elvl")) if elvl < 0
    end

    def validate_pixel_dimensions!(data, path:)
      require_object!(data, path: path)
      width = require_integer!(data, "width", path: path)
      raise ValidationError.new("width must be positive", path: child_path(path, "width")) unless width > 0
      height = require_integer!(data, "height", path: path)
      raise ValidationError.new("height must be positive", path: child_path(path, "height")) unless height > 0
    end

    def validate_feet_dimensions!(data, path:)
      require_object!(data, path: path)
      width = require_numeric!(data, "width", path: path)
      raise ValidationError.new("width must be positive", path: child_path(path, "width")) unless width > 0
      height = require_numeric!(data, "height", path: path)
      raise ValidationError.new("height must be positive", path: child_path(path, "height")) unless height > 0
    end

    # Client-only - purely a walk-preview display setting (see
    # MapPreviewScene.js's setLightingMode), not consumed by the game
    # server. Optional; a missing value means "daylight" (see
    # Build::MapsController#blank_map's default).
    def validate_lighting!(data, path:)
      lighting = require_string!(data, "lighting", path: path)
      require_one_of!(lighting, LIGHTING_OPTIONS, path: child_path(path, "lighting"))
    end

    def validate_barriers!(data, path:)
      barriers = data["barriers"]
      raise ValidationError.new("barriers must be an array", path: child_path(path, "barriers")) unless barriers.is_a?(Array)
      barriers.each_with_index do |barrier, i|
        validate_barrier!(barrier, path: index_path(child_path(path, "barriers"), i))
      end
      validate_barrier_segment_count!(barriers, path: child_path(path, "barriers"))
    end

    def validate_barrier_segment_count!(barriers, path:)
      total = barriers.sum { |barrier| barrier_segment_count(barrier) }
      return if total <= MAX_BARRIER_SEGMENTS
      raise ValidationError.new("barriers use #{total} segments, more than the maximum of #{MAX_BARRIER_SEGMENTS}", path: path)
    end

    def barrier_segment_count(barrier)
      case barrier["type"]
      when "wall" then [(barrier["locations"] || []).length - 1, 0].max
      when "circle" then CIRCLE_BARRIER_SEGMENTS
      else 0
      end
    end

    def validate_connections!(data, path:)
      connections = data["connections"]
      raise ValidationError.new("connections must be an array", path: child_path(path, "connections")) unless connections.is_a?(Array)
      connections.each_with_index do |conn, i|
        validate_connection!(conn, path: index_path(child_path(path, "connections"), i))
      end
    end

    def validate_units!(data, path:)
      units = data["units"]
      raise ValidationError.new("units must be an array", path: child_path(path, "units")) unless units.is_a?(Array)
      units.each_with_index do |unit, i|
        UnitValidator.validate!(unit, path: index_path(child_path(path, "units"), i))
      end
    end

    def validate_barrier!(data, path:)
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, BARRIER_TYPES, path: child_path(path, "type"))
      case type
      when "wall" then validate_wall_barrier!(data, path: path)
      when "circle" then validate_circle_barrier!(data, path: path)
      end
    end

    def validate_wall_barrier!(data, path:)
      locations = require_array!(data, "locations", path: path, min: 2)
      locations.each_with_index do |loc, i|
        validate_location!(loc, path: index_path(child_path(path, "locations"), i))
      end
    end

    def validate_circle_barrier!(data, path:)
      validate_location!(require_hash!(data, "location", path: path), path: child_path(path, "location"))
      radius = require_numeric!(data, "radius", path: path)
      raise ValidationError.new("radius must be between 0 and 30.0", path: child_path(path, "radius")) unless radius > 0 && radius <= 30.0
    end

    def validate_connection!(data, path:)
      require_object!(data, path: path)
      require_string!(data, "identifier", path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, CONNECTION_TYPES, path: child_path(path, "type"))
      case type
      when "point" then validate_point_connection!(data, path: path)
      when "line" then validate_line_connection!(data, path: path)
      end
    end

    def validate_point_connection!(data, path:)
      validate_position!(require_hash!(data, "position", path: path), path: child_path(path, "position"))
      fuzz_radius = require_numeric!(data, "fuzzRadius", path: path)
      raise ValidationError.new("fuzzRadius must be between 0 and 20", path: child_path(path, "fuzzRadius")) unless fuzz_radius.between?(0.0, 20.0)
      fuzz_angle = require_numeric!(data, "fuzzAngle", path: path)
      raise ValidationError.new("fuzzAngle must be between 0 and 360", path: child_path(path, "fuzzAngle")) unless fuzz_angle.between?(0.0, 360.0)
    end

    def validate_line_connection!(data, path:)
      validate_location!(require_hash!(data, "start", path: path), path: child_path(path, "start"))
      validate_location!(require_hash!(data, "end", path: path), path: child_path(path, "end"))
    end
  end
end
