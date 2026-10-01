module WorldContent
  # How a world's zones connect, worked out from the world file's worldLinks
  # and the zones' own connection pools (see docs/schema/world.md). A link
  # side names a connection either by a zone's openConnections *name*
  # (kind "open") or by an entryPoints key (kind "entryPoint"); everything
  # here speaks in the zone's own "mapId/connectionId" keys instead, which
  # is what the game server and WorldCharacter positions use. Links with a
  # requiredKey are ignored until keys exist.
  module Links
    module_function

    # The "mapId/connectionId" keys zone_key can be left through: every
    # link side in this zone, except the far (B) side of a one-way link.
    def exits_for(world_data, zone_key, zone_data)
      traversable_sides(world_data).filter_map do |from, _to|
        connection_key(zone_data, from) if from["zone"] == zone_key
      end.uniq
    end

    # Where leaving zone_key through connection_key leads, as
    # [zone_key, connection_key], or nil if it doesn't lead anywhere.
    # zone_data_for(key) returns a zone's parsed file; it's only called for
    # the zones the answer depends on.
    def destination(world_data, zone_key, connection_key, zone_data_for)
      traversable_sides(world_data).each do |from, to|
        next unless from["zone"] == zone_key
        next unless connection_key(zone_data_for.call(zone_key), from) == connection_key

        to_key = connection_key(zone_data_for.call(to["zone"]), to)
        return to_key && [to["zone"], to_key]
      end
      nil
    end

    # The first world entry point that needs no key, as [zone_key,
    # connection_key].
    def default_entry(world_data)
      key, = (world_data["entryPoints"] || {}).find { |_key, required| required.nil? }
      key&.split("/", 2)
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
