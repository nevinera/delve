module WorldContent
  # How a world's zones connect, worked out at import from the world file's
  # worldLinks and the zones' own connection pools (see
  # docs/schema/world.md). A link side names a connection either by a
  # zone's openConnections *name* (kind "open") or by an entryPoints key
  # (kind "entryPoint"); everything here speaks in the zone's own
  # "mapId/connectionId" keys instead, which is what the game server and
  # WorldCharacter positions use. Links with a requiredKey are ignored until
  # keys exist.
  module Links
    module_function

    # Where each of zone_key's exits leads:
    # {"mapId/connectionId" => {"zone" => zone_key, "connection" => "mapId/connectionId"}}.
    # Every link side in this zone is an exit, except the far (B) side of a
    # one-way link. zones_by_key maps each zone key to its parsed file.
    def links_for(world_data, zone_key, zones_by_key)
      traversable_sides(world_data).each_with_object({}) do |(from, to), links|
        next unless from["zone"] == zone_key
        from_key = connection_key(zones_by_key.fetch(zone_key), from)
        to_key = connection_key(zones_by_key.fetch(to["zone"]), to)
        links[from_key] = {"zone" => to["zone"], "connection" => to_key} if from_key && to_key
      end
    end

    # The first world entry point that needs no key, as [zone_key,
    # connection_key].
    def default_entry(world_data)
      key, = (world_data["entryPoints"] || {}).find { |_key, required| required.nil? }
      key && split_entry_point(key)
    end

    # "zoneId/mapId/connectionId" -> [zoneId, "mapId/connectionId"]. Splits
    # from the right, since zone keys can themselves contain "/"
    # ("small/forest") but map and connection ids can't.
    def split_entry_point(key)
      parts = key.split("/")
      [parts[0..-3].join("/"), parts.last(2).join("/")]
    end

    # Whether zone_data has a map connection at "mapId/connectionId".
    def connection_exists?(zone_data, connection_key)
      map_id, connection_id = connection_key.to_s.split("/", 2)
      map = (zone_data["maps"] || []).find { |m| m.is_a?(Hash) && m["identifier"] == map_id }
      (map&.dig("connections") || []).any? { |c| c["identifier"] == connection_id }
    end

    # [from, to] link-side pairs a unit may travel along.
    def traversable_sides(world_data)
      (world_data["worldLinks"] || []).reject { |link| link["requiredKey"] }.flat_map do |link|
        pairs = [[link["zoneA"], link["zoneB"]]]
        pairs << [link["zoneB"], link["zoneA"]] unless link["oneWay"]
        pairs
      end
    end

    def connection_key(zone_data, side)
      return side["connection"] if side["kind"] == "entryPoint"
      (zone_data["openConnections"] || {}).key(side["connection"])
    end
  end
end
