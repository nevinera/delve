module Validators
  # A zone's entryPoints and openConnections (see docs/schema/zone.md): each
  # is an object keyed by "mapId/connectionId", and every key must name one
  # of the zone's map connections. Takes the whole (resolved) zone.
  class ZoneConnectionPoolsValidator < Base
    def validate!(data, path: "$")
      validate_entry_points!(data, path: path) if given?(data, "entryPoints")
      validate_open_connections!(data, path: path) if given?(data, "openConnections")
    end

    private

    def validate_entry_points!(data, path:)
      entry_points = data["entryPoints"]
      raise ValidationError.new("entryPoints must be an object", path: child_path(path, "entryPoints")) unless entry_points.is_a?(Hash)
      entry_points.each do |key, value|
        ep_path = child_path(child_path(path, "entryPoints"), key)
        raise ValidationError.new("entryPoint value must be a string or null", path: ep_path) unless value.nil? || value.is_a?(String)
      end
      validate_connection_keys!(data, "entryPoints", path: path)
    end

    def validate_open_connections!(data, path:)
      open_connections = data["openConnections"]
      raise ValidationError.new("openConnections must be an object", path: child_path(path, "openConnections")) unless open_connections.is_a?(Hash)
      open_connections.each do |key, value|
        oc_path = child_path(child_path(path, "openConnections"), key)
        raise ValidationError.new("openConnection value must be a string", path: oc_path) unless value.is_a?(String)
      end
      validate_connection_keys!(data, "openConnections", path: path)
    end

    # Every key in section must be a "mapId/connectionId" naming one of the
    # zone's map connections - a stale one (left by a rename) is where a
    # world link would land a player, and they'd fall back to the world's
    # default entry point instead.
    def validate_connection_keys!(data, section, path:)
      known = connection_keys(data["maps"])
      data[section].each_key do |key|
        next if known.include?(key)
        raise ValidationError.new("#{section} key #{key.inspect} doesn't name a connection on any of the zone's maps",
          path: child_path(child_path(path, section), key))
      end
    end

    def connection_keys(maps)
      maps.select { |m| m.is_a?(Hash) }.flat_map do |map|
        Array(map["connections"]).filter_map { |c| "#{map["identifier"]}/#{c["identifier"]}" if c.is_a?(Hash) }
      end.to_set
    end
  end
end
