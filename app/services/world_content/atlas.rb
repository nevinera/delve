module WorldContent
  # What the in-game map draws of a world's atlas (docs/schema/world.md#atlas),
  # worked out at import, when every zone's maps are at hand: each laid-out
  # zone's name and outline, each placed map's name, place, size,
  # thumbnail and places, and the lines for the links between placed maps (bends
  # applied). Mirrors client/src/worldEditor/atlasLayout.js's atlasLinks.
  # nil for a world with no atlas.
  module Atlas
    module_function

    # zones maps each zone key to {data: its parsed .full.json, url: where
    # it was fetched from}.
    def payload(world_data, zones)
      atlas = world_data["atlas"]
      return unless atlas.is_a?(Hash) && atlas["zones"].is_a?(Hash)
      maps = placed_maps(atlas, zones)
      {
        "zones" => atlas["zones"].to_h { |key, entry| [key, {"name" => zones.dig(key, :data, "name") || key, "outline" => entry["outline"]}] },
        "maps" => maps.values.map { |m| m.except("data") },
        "links" => links(world_data, atlas, zones, maps)
      }
    end

    # {[zone, map] => {"zone", "map", "name", "x", "y", "width", "height",
    # "thumbnail_url", "data"}} for each map in the atlas its zone has.
    def placed_maps(atlas, zones)
      atlas["zones"].each_with_object({}) do |(zone_key, entry), placed|
        zone = zones[zone_key] or next
        (entry["maps"] || {}).each do |map_id, at|
          map = zone_map(zone[:data], map_id) or next
          placed[[zone_key, map_id]] = placed_map(zone_key, zone, map, at)
        end
      end
    end

    def zone_map(zone_data, map_id) = (zone_data["maps"] || []).find { |m| m["identifier"] == map_id }

    def placed_map(zone_key, zone, map, at)
      {
        "zone" => zone_key, "map" => map["identifier"], "name" => map["name"] || map["identifier"],
        "x" => at["x"], "y" => at["y"], **size(map),
        "thumbnail_url" => map["thumbnailUrl"] && URI.join(zone[:url], map["thumbnailUrl"]).to_s,
        "places" => places(map),
        "data" => map
      }
    end

    def size(map)
      dims = map["feetDimensions"] || {}
      {"width" => dims["width"].to_f, "height" => dims["height"].to_f}
    end

    # The map's places, for the in-game map's fog: [{"identifier",
    # "polygon"}], in the map's own feet.
    def places(map)
      (map["places"] || []).filter_map do |place|
        polygon = place["polygon"]
        {"identifier" => place["identifier"], "polygon" => polygon} if polygon.is_a?(Array) && polygon.length >= 3
      end
    end

    def links(world_data, atlas, zones, maps)
      ends = zone_link_ends(zones) + world_link_ends(world_data, zones)
      ends.filter_map { |kind, a, b| line(kind, a, b, atlas, maps) }
    end

    # [kind, end, end] for each link: zones' own, then the world's.
    def zone_link_ends(zones)
      zones.flat_map do |zone_key, zone|
        (zone[:data]["zoneLinks"] || []).filter_map do |link|
          a, b = link.values_at("connectionA", "connectionB")
          ["zone", end_of(zone_key, a), end_of(zone_key, b)] if a && b
        end
      end
    end

    def world_link_ends(world_data, zones)
      (world_data["worldLinks"] || []).filter_map do |link|
        a, b = link.values_at("zoneA", "zoneB").map { |side| world_link_end(zones, side) }
        ["world", a, b] if a && b
      end
    end

    def end_of(zone_key, side) = {zone: zone_key, map: side["map"], connection: side["connection"]}

    def world_link_end(zones, side)
      zone = zones[side&.dig("zone")] or return
      map, connection = Links.connection_key(zone[:data], side).to_s.split("/", 2)
      {zone: side["zone"], map:, connection:} if map && connection
    end

    def line(kind, a, b, atlas, maps)
      from, to = point(a, maps), point(b, maps)
      return unless from && to
      key = link_key(a, b)
      bend = atlas.dig("bends", key)
      {"kind" => kind, "key" => key, "from" => from, "to" => to, "through" => bend && offset(midpoint(from, to), bend),
       "ends" => [a, b].map { |e| {"zone" => e[:zone], "map" => e[:map]} }}
    end

    # The link's two ends as "zone/map/connection", sorted and joined by "|":
    # what its bend is keyed by.
    def link_key(a, b) = [a, b].map { |e| e.values_at(:zone, :map, :connection).join("/") }.sort.join("|")

    # Where the end's connection sits in world feet, from its map's origin.
    def point(link_end, maps)
      placed = maps[[link_end[:zone], link_end[:map]]] or return
      local = connection_position(placed["data"], link_end[:connection]) or return
      offset(local, placed)
    end

    # Where the map's connection sits in its own feet: a line's midpoint, or
    # a point's position.
    def connection_position(map, identifier)
      conn = (map["connections"] || []).find { |c| c["identifier"] == identifier } or return
      (conn["start"] && conn["end"]) ? midpoint(conn["start"], conn["end"]) : conn["position"]
    end

    def midpoint(a, b) = {"x" => (a["x"] + b["x"]) / 2.0, "y" => (a["y"] + b["y"]) / 2.0}

    def offset(point, by) = {"x" => point["x"] + by["x"], "y" => point["y"] + by["y"]}
  end
end
