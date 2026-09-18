module Validators
  class WorldValidator < Base
    def validate!(data, path: "$")
      require_object!(data, path: path)
      validate_fixed_fields!(data, path: path)
      validate_optional_fields!(data, path: path)
    end

    private

    def validate_fixed_fields!(data, path:)
      require_string!(data, "name", path: path)
      validate_zones!(data, path: path)
      validate_entry_points!(data, path: path)
    end

    def validate_optional_fields!(data, path:)
      require_string!(data, "thumbnailUrl", path: path) if given?(data, "thumbnailUrl")
      validate_elevation_range!(data, path: path) if given?(data, "elevationRange")
      validate_world_links!(data, path: path) if given?(data, "worldLinks")
    end

    def validate_elevation_range!(data, path:)
      range = data["elevationRange"]
      range_path = child_path(path, "elevationRange")
      validate_elevation_range_shape!(range, path: range_path)
      min, max = range
      raise ValidationError.new("elevationRange values must be at least 0", path: range_path) if min < 0
      raise ValidationError.new("elevationRange min must not exceed max", path: range_path) if min > max
    end

    def validate_elevation_range_shape!(range, path:)
      return if range.is_a?(Array) && range.length == 2 && range.all? { |v| v.is_a?(Integer) }
      raise ValidationError.new("elevationRange must be a [min, max] array of integers", path: path)
    end

    def validate_zones!(data, path:)
      zones = require_hash!(data, "zones", path: path)
      zones_path = child_path(path, "zones")
      raise ValidationError.new("zones must have at least 1 entry", path: zones_path) if zones.empty?
      zones.each do |key, entry|
        validate_zone_entry!(entry, path: child_path(zones_path, key))
      end
    end

    def validate_zone_entry!(data, path:)
      require_object!(data, path: path)
      require_string!(data, "path", path: path)
      require_string!(data, "name", path: path)
      require_string!(data, "description", path: path) if given?(data, "description")
    end

    def validate_world_links!(data, path:)
      world_links = data["worldLinks"]
      raise ValidationError.new("worldLinks must be an array", path: child_path(path, "worldLinks")) unless world_links.is_a?(Array)
      world_links.each_with_index do |link, i|
        validate_world_link!(link, path: index_path(child_path(path, "worldLinks"), i))
      end
    end

    def validate_world_link!(data, path:)
      require_object!(data, path: path)
      validate_zone_reference!(require_hash!(data, "zoneA", path: path), path: child_path(path, "zoneA"))
      validate_zone_reference!(require_hash!(data, "zoneB", path: path), path: child_path(path, "zoneB"))
      require_boolean!(data, "oneWay", path: path)
      validate_required_key!(data, path: path)
    end

    def validate_required_key!(data, path:)
      raise ValidationError.new("requiredKey is required", path: child_path(path, "requiredKey")) unless data.key?("requiredKey")
      required_key = data["requiredKey"]
      return if required_key.nil? || required_key.is_a?(String)
      raise ValidationError.new("requiredKey must be a string or null", path: child_path(path, "requiredKey"))
    end

    KINDS = %w[open entryPoint].freeze

    def validate_zone_reference!(data, path:)
      require_object!(data, path: path)
      require_string!(data, "zone", path: path)
      require_one_of!(data["kind"], KINDS, path: child_path(path, "kind"))
      require_string!(data, "connection", path: path)
    end

    def validate_entry_points!(data, path:)
      entry_points = require_hash!(data, "entryPoints", path: path)
      entry_points_path = child_path(path, "entryPoints")
      raise ValidationError.new("entryPoints must have at least 1 entry", path: entry_points_path) if entry_points.empty?
      entry_points.each do |key, value|
        ep_path = child_path(entry_points_path, key)
        raise ValidationError.new("entryPoint value must be a string or null", path: ep_path) unless value.nil? || value.is_a?(String)
      end
    end
  end
end
