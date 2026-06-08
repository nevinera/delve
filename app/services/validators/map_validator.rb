module Validators
  class MapValidator < Base
    BARRIER_TYPES = %w[wall circle].freeze
    CONNECTION_TYPES = %w[point line].freeze

    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "identifier", path: path)
      require_string!(data, "name", path: path)
      require_string!(data, "imageUrl", path: path)

      pixel_dim = require_hash!(data, "pixelDimensions", path: path)
      validate_pixel_dimensions!(pixel_dim, path: child_path(path, "pixelDimensions"))

      feet_dim = require_hash!(data, "feetDimensions", path: path)
      validate_feet_dimensions!(feet_dim, path: child_path(path, "feetDimensions"))

      if data.key?("barriers")
        barriers = data["barriers"]
        raise ValidationError.new("barriers must be an array", path: child_path(path, "barriers")) unless barriers.is_a?(Array)
        barriers.each_with_index do |barrier, i|
          validate_barrier!(barrier, path: index_path(child_path(path, "barriers"), i))
        end
      end

      if data.key?("connections")
        connections = data["connections"]
        raise ValidationError.new("connections must be an array", path: child_path(path, "connections")) unless connections.is_a?(Array)
        connections.each_with_index do |conn, i|
          validate_connection!(conn, path: index_path(child_path(path, "connections"), i))
        end
      end

      if data.key?("units")
        units = data["units"]
        raise ValidationError.new("units must be an array", path: child_path(path, "units")) unless units.is_a?(Array)
        units.each_with_index do |unit, i|
          UnitValidator.validate!(unit, path: index_path(child_path(path, "units"), i))
        end
      end
    end

    private

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

    def validate_barrier!(data, path:)
      require_object!(data, path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, BARRIER_TYPES, path: child_path(path, "type"))

      case type
      when "wall"
        locations = require_array!(data, "locations", path: path, min: 2)
        locations.each_with_index do |loc, i|
          validate_location!(loc, path: index_path(child_path(path, "locations"), i))
        end
      when "circle"
        location = require_hash!(data, "location", path: path)
        validate_location!(location, path: child_path(path, "location"))
        radius = require_numeric!(data, "radius", path: path)
        unless radius > 0 && radius <= 30.0
          raise ValidationError.new("radius must be between 0 and 30.0", path: child_path(path, "radius"))
        end
      end
    end

    def validate_connection!(data, path:)
      require_object!(data, path: path)
      require_string!(data, "identifier", path: path)
      type = require_string!(data, "type", path: path)
      require_one_of!(type, CONNECTION_TYPES, path: child_path(path, "type"))

      case type
      when "point"
        position = require_hash!(data, "position", path: path)
        validate_position!(position, path: child_path(path, "position"))
        fuzz_radius = require_numeric!(data, "fuzzRadius", path: path)
        unless fuzz_radius >= 0.0 && fuzz_radius <= 20.0
          raise ValidationError.new("fuzzRadius must be between 0 and 20", path: child_path(path, "fuzzRadius"))
        end
        fuzz_angle = require_numeric!(data, "fuzzAngle", path: path)
        unless fuzz_angle >= 0.0 && fuzz_angle <= 360.0
          raise ValidationError.new("fuzzAngle must be between 0 and 360", path: child_path(path, "fuzzAngle"))
        end
      when "line"
        start_loc = require_hash!(data, "start", path: path)
        validate_location!(start_loc, path: child_path(path, "start"))
        end_loc = require_hash!(data, "end", path: path)
        validate_location!(end_loc, path: child_path(path, "end"))
      end
    end
  end
end
