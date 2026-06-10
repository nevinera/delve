module Validators
  class ZoneValidator < Base
    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "name", path: path)
      require_boolean!(data, "private", path: path)
      validate_unit_types!(data, path: path) if data.key?("unitTypes")
      validate_maps!(data, path: path)
      validate_zone_links!(data, path: path) if data.key?("zoneLinks")
      validate_entry_points!(data, path: path) if data.key?("entryPoints")
      validate_open_connections!(data, path: path) if data.key?("openConnections")
    end

    private

    def validate_unit_types!(data, path:)
      unit_types = data["unitTypes"]
      raise ValidationError.new("unitTypes must be an object", path: child_path(path, "unitTypes")) unless unit_types.is_a?(Hash)
      unit_types.each do |key, unit_type|
        UnitTypeValidator.validate!(unit_type, path: child_path(child_path(path, "unitTypes"), key))
      end
    end

    def validate_maps!(data, path:)
      maps = require_array!(data, "maps", path: path, min: 1)
      maps.each_with_index do |map, i|
        MapValidator.validate!(map, path: index_path(child_path(path, "maps"), i))
      end
      validate_unit_identifier_uniqueness!(maps, path: path)
    end

    def validate_unit_identifier_uniqueness!(maps, path:)
      seen = {}
      maps.each { |map| check_map_unit_identifiers!(map, seen, path: path) }
    end

    def check_map_unit_identifiers!(map, seen, path:)
      return unless map.is_a?(Hash)
      map_id = map["identifier"]
      Array(map["units"]).each do |unit|
        next unless unit.is_a?(Hash) && unit["identifier"].is_a?(String)
        register_unit_identifier!(unit["identifier"], map_id, seen, path: path)
      end
    end

    def register_unit_identifier!(id, map_id, seen, path:)
      if seen.key?(id)
        raise ValidationError.new(
          "unit identifier #{id.inspect} is already used in map #{seen[id].inspect}",
          path: child_path(path, "maps")
        )
      end
      seen[id] = map_id
    end

    def validate_zone_links!(data, path:)
      zone_links = data["zoneLinks"]
      raise ValidationError.new("zoneLinks must be an array", path: child_path(path, "zoneLinks")) unless zone_links.is_a?(Array)
      zone_links.each_with_index do |link, i|
        validate_zone_link!(link, path: index_path(child_path(path, "zoneLinks"), i))
      end
    end

    def validate_entry_points!(data, path:)
      entry_points = data["entryPoints"]
      raise ValidationError.new("entryPoints must be an object", path: child_path(path, "entryPoints")) unless entry_points.is_a?(Hash)
      entry_points.each do |key, value|
        ep_path = child_path(child_path(path, "entryPoints"), key)
        raise ValidationError.new("entryPoint value must be a string or null", path: ep_path) unless value.nil? || value.is_a?(String)
      end
    end

    def validate_open_connections!(data, path:)
      open_connections = data["openConnections"]
      raise ValidationError.new("openConnections must be an object", path: child_path(path, "openConnections")) unless open_connections.is_a?(Hash)
      open_connections.each do |key, value|
        oc_path = child_path(child_path(path, "openConnections"), key)
        raise ValidationError.new("openConnection value must be a string", path: oc_path) unless value.is_a?(String)
      end
    end

    def validate_zone_link!(data, path:)
      require_object!(data, path: path)
      validate_connection_identifier!(require_hash!(data, "connectionA", path: path), path: child_path(path, "connectionA"))
      validate_connection_identifier!(require_hash!(data, "connectionB", path: path), path: child_path(path, "connectionB"))
      require_boolean!(data, "oneWay", path: path)
      validate_required_key!(data, path: path)
    end

    def validate_required_key!(data, path:)
      raise ValidationError.new("requiredKey is required", path: child_path(path, "requiredKey")) unless data.key?("requiredKey")
      required_key = data["requiredKey"]
      return if required_key.nil? || required_key.is_a?(String)
      raise ValidationError.new("requiredKey must be a string or null", path: child_path(path, "requiredKey"))
    end

    def validate_connection_identifier!(data, path:)
      require_object!(data, path: path)
      require_string!(data, "map", path: path)
      require_string!(data, "connection", path: path)
    end
  end
end
