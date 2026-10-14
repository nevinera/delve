module Validators
  # Cross-checks a world against the zones it references: every worldLink
  # side and world entry point must name a zone in the world, and a
  # connection point that zone actually exposes (an openConnections name for
  # kind "open", an entryPoints key for kind "entryPoint" and for world entry
  # points), mirroring client/src/worldEditor/worldLinkStatus.js. And its
  # atlas must name only the world's zones and their maps, each map inside
  # its zone's outline, with no maps or outlines overlapping (each zone's
  # maps need identifier and feetDimensions). Run after WorldValidator and
  # each zone's ZoneValidator have passed.
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
      validate_atlas! if @world_data["atlas"]
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

    def validate_atlas!
      zones_path = child_path(child_path("$", "atlas"), "zones")
      rects = []
      outlines = @world_data["atlas"]["zones"].to_h do |zone_key, entry|
        [zone_key, validate_atlas_zone!(zone_key, entry, rects, path: child_path(zones_path, zone_key))]
      end
      validate_no_overlapping_maps!(rects)
      validate_no_overlapping_outlines!(outlines, zones_path)
    end

    # Checks each of the zone's placed maps lies inside its outline, adding
    # [zone, map, corners, path] to rects for each; returns the outline.
    def validate_atlas_zone!(zone_key, entry, rects, path:)
      zone = @zones_by_key[zone_key]
      raise ValidationError.new("unknown zone \"#{zone_key}\"", path: path) if zone.nil?
      outline = outline_points(entry)
      entry["maps"].each do |map_key, location|
        map_path = child_path(child_path(path, "maps"), map_key)
        rect = placed_rect!(zone_map!(zone, zone_key, map_key, path: map_path), location, outline, path: map_path)
        rects << [zone_key, map_key, rect, map_path]
      end
      outline
    end

    def outline_points(entry) = entry["outline"].map { |p| [p["x"], p["y"]] }

    # The placed map's corners, checked to lie inside its zone's outline.
    def placed_rect!(map, location, outline, path:)
      rect = map_rect(map, location)
      return rect if AtlasGeometry.rect_inside?(rect, outline)
      raise ValidationError.new("map \"#{map["identifier"]}\" isn't inside its zone's outline", path: path)
    end

    def zone_map!(zone, zone_key, map_key, path:)
      map = (zone["maps"] || []).find { |m| m["identifier"] == map_key }
      raise ValidationError.new("zone \"#{zone_key}\" has no map \"#{map_key}\"", path: path) if map.nil?
      map
    end

    def map_rect(map, location)
      dims = map["feetDimensions"] || {}
      AtlasGeometry.rect_corners(location["x"], location["y"], dims["width"].to_f, dims["height"].to_f)
    end

    def validate_no_overlapping_maps!(rects)
      rects.combination(2) do |(zone_a, map_a, a, _), (zone_b, map_b, b, path)|
        next unless AtlasGeometry.rects_overlap?(a, b)
        raise ValidationError.new("map \"#{zone_b}/#{map_b}\" overlaps \"#{zone_a}/#{map_a}\"", path: path)
      end
    end

    def validate_no_overlapping_outlines!(outlines, zones_path)
      outlines.to_a.combination(2) do |(key_a, a), (key_b, b)|
        next unless AtlasGeometry.polygons_overlap?(a, b)
        raise ValidationError.new("zone \"#{key_b}\"'s outline overlaps \"#{key_a}\"'s", path: child_path(child_path(zones_path, key_b), "outline"))
      end
    end

    def exposed_connections(zone, kind)
      (kind == "open") ? (zone["openConnections"] || {}).values : (zone["entryPoints"] || {}).keys
    end

    def pool_name(kind) = (kind == "open") ? "openConnection" : "entryPoint"
  end
end
