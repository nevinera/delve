module Validators
  class ZoneValidator < Base
    def validate!(data, path: "$")
      require_object!(data, path: path)
      require_string!(data, "name", path: path)
      require_boolean!(data, "private", path: path)

      if data.key?("unitTypes")
        unit_types = data["unitTypes"]
        raise ValidationError.new("unitTypes must be an object", path: child_path(path, "unitTypes")) unless unit_types.is_a?(Hash)
        unit_types.each do |key, unit_type|
          UnitTypeValidator.validate!(unit_type, path: child_path(child_path(path, "unitTypes"), key))
        end
      end

      maps = require_array!(data, "maps", path: path, min: 1)
      maps.each_with_index do |map, i|
        MapValidator.validate!(map, path: index_path(child_path(path, "maps"), i))
      end

      if data.key?("zoneLinks")
        zone_links = data["zoneLinks"]
        raise ValidationError.new("zoneLinks must be an array", path: child_path(path, "zoneLinks")) unless zone_links.is_a?(Array)
        zone_links.each_with_index do |link, i|
          validate_zone_link!(link, path: index_path(child_path(path, "zoneLinks"), i))
        end
      end

      if data.key?("entryPoints")
        entry_points = data["entryPoints"]
        raise ValidationError.new("entryPoints must be an object", path: child_path(path, "entryPoints")) unless entry_points.is_a?(Hash)
        entry_points.each do |key, value|
          ep_path = child_path(child_path(path, "entryPoints"), key)
          unless value.nil? || value.is_a?(String)
            raise ValidationError.new("entryPoint value must be a string or null", path: ep_path)
          end
        end
      end

      if data.key?("openConnections")
        open_connections = data["openConnections"]
        raise ValidationError.new("openConnections must be an object", path: child_path(path, "openConnections")) unless open_connections.is_a?(Hash)
        open_connections.each do |key, value|
          oc_path = child_path(child_path(path, "openConnections"), key)
          raise ValidationError.new("openConnection value must be a string", path: oc_path) unless value.is_a?(String)
        end
      end
    end

    private

    def validate_zone_link!(data, path:)
      require_object!(data, path: path)
      conn_a = require_hash!(data, "connectionA", path: path)
      validate_connection_identifier!(conn_a, path: child_path(path, "connectionA"))
      conn_b = require_hash!(data, "connectionB", path: path)
      validate_connection_identifier!(conn_b, path: child_path(path, "connectionB"))
      require_boolean!(data, "oneWay", path: path)
      unless data.key?("requiredKey")
        raise ValidationError.new("requiredKey is required", path: child_path(path, "requiredKey"))
      end
      required_key = data["requiredKey"]
      unless required_key.nil? || required_key.is_a?(String)
        raise ValidationError.new("requiredKey must be a string or null", path: child_path(path, "requiredKey"))
      end
    end

    def validate_connection_identifier!(data, path:)
      require_object!(data, path: path)
      require_string!(data, "map", path: path)
      require_string!(data, "connection", path: path)
    end
  end
end
