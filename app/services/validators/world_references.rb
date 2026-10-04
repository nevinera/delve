module Validators
  # Cross-checks a world against the zones it references: every worldLink
  # side and world entry point must name a zone in the world, and a
  # connection point that zone actually exposes (an openConnections name for
  # kind "open", an entryPoints key for kind "entryPoint" and for world entry
  # points). Mirrors client/src/worldEditor/worldLinkStatus.js. Run after
  # WorldValidator and each zone's ZoneValidator have passed.
  class WorldReferences
    include Helpers

    def self.validate!(world_data, zones_by_key)
      new(world_data, zones_by_key).validate!
    end

    def initialize(world_data, zones_by_key)
      @world_data = world_data
      @zones_by_key = zones_by_key
    end

    def validate!
      validate_world_links!
      validate_entry_points!
    end

    private

    def validate_world_links!
      links_path = child_path("$", "worldLinks")
      (@world_data["worldLinks"] || []).each_with_index do |link, i|
        link_path = index_path(links_path, i)
        %w[zoneA zoneB].each do |side|
          ref = link[side]
          validate_connection!(ref["zone"], ref["kind"], ref["connection"], path: child_path(link_path, side))
        end
      end
    end

    def validate_entry_points!
      entry_points_path = child_path("$", "entryPoints")
      @world_data["entryPoints"].each_key do |key|
        zone_key, entry_point = WorldContent::Links.split_entry_point(key)
        validate_connection!(zone_key, "entryPoint", entry_point.to_s, path: child_path(entry_points_path, key))
      end
    end

    def validate_connection!(zone_key, kind, connection, path:)
      zone = @zones_by_key[zone_key]
      raise ValidationError.new("unknown zone \"#{zone_key}\"", path: path) if zone.nil?
      return if exposed_connections(zone, kind).include?(connection)

      raise ValidationError.new("zone \"#{zone_key}\" has no #{pool_name(kind)} \"#{connection}\"", path: path)
    end

    def exposed_connections(zone, kind)
      (kind == "open") ? (zone["openConnections"] || {}).values : (zone["entryPoints"] || {}).keys
    end

    def pool_name(kind) = (kind == "open") ? "openConnection" : "entryPoint"
  end
end
