import {connectionStatus, connectionKey} from "./connectionStatus";

// One row per connection on a $ref'd map (see docs/schema/map.md's
// MapConnection) - read-only as far as the connection object itself
// (identifier/type/geometry stay owned by the map editor, which is the
// only place with a canvas to place them against - see
// plans/zone-editor.md step 4). What's editable here is purely zone-level:
// whether this connection is an entry point, an open connection, or one end
// of a zoneLink. requiredKey (entry points and zoneLinks) and a zoneLink's
// oneWay are deliberately not exposed anywhere yet - every entry
// point/link is assumed keyless and two-way for now (see
// plans/zone-editor.md).
//
// linkTargets: every open connection anywhere in the zone (see
// ZoneMapsPanel), used to populate "+ Link to" - filtered here to exclude
// this map's own connections, since a zoneLink between two ports on the
// same map isn't a real gameplay case (see plans/zone-editor.md's
// self-loop decision).
export default function ZoneMapConnectionsPanel({mapIdentifier, connections, zoneData, dispatch, linkTargets}) {
  if (!mapIdentifier || connections.length === 0) {
    return <p className="map-sidebar-hint">No connections on this map yet.</p>;
  }

  const otherMapTargets = (linkTargets ?? []).filter((target) => target.mapIdentifier !== mapIdentifier);

  function handleLinkTo(connectionIdentifier, value) {
    if (!value) return;
    const [targetMap, targetConnection] = value.split("/");
    dispatch({
      type: "ADD_ZONE_LINK",
      connectionA: {map: mapIdentifier, connection: connectionIdentifier},
      connectionB: {map: targetMap, connection: targetConnection},
    });
  }

  return (
    <div className="zone-connections-list">
      {connections.map((connection) => {
        const status = connectionStatus(mapIdentifier, connection.identifier, zoneData);
        return (
          <div className="entry-block zone-connection-row" key={connection.identifier}>
            <div className="map-row-summary">
              <span className="zone-connection-name">{connection.identifier}</span>
              <span className="zone-connection-type">({connection.type})</span>
            </div>
            {status.type === "open" && (
              <div className="zone-connection-status add-buttons-row">
                <span className="zone-connection-status-label">Open</span>
                <button type="button" className="add-entry" onClick={() => dispatch({type: "SET_ENTRY_POINT", key: status.key, requiredKey: null})}>
                  + Entry Point
                </button>
                <button type="button" className="add-entry" onClick={() => dispatch({type: "SET_OPEN_CONNECTION", key: status.key, name: ""})}>
                  + Open Connection
                </button>
                {otherMapTargets.length > 0 && (
                  <select value="" onChange={(e) => handleLinkTo(connection.identifier, e.target.value)}>
                    <option value="">+ Link to…</option>
                    {otherMapTargets.map((target) => (
                      <option key={connectionKey(target.mapIdentifier, target.connectionIdentifier)} value={connectionKey(target.mapIdentifier, target.connectionIdentifier)}>
                        {target.mapName} — {target.connectionIdentifier}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {status.type === "entryPoint" && (
              <div className="zone-connection-status">
                {/* requiredKey is ignored for now - every entry point is
                    assumed keyless (see plans/zone-editor.md). */}
                <span className="zone-connection-status-label">Entry point</span>
                <button type="button" className="remove-entry" onClick={() => dispatch({type: "REMOVE_ENTRY_POINT", key: status.key})}>
                  Remove
                </button>
              </div>
            )}
            {status.type === "openConnection" && (
              <div className="zone-connection-status">
                <span className="zone-connection-status-label">Open connection - exposed as:</span>
                <input
                  type="text"
                  value={status.name ?? ""}
                  onChange={(e) => dispatch({type: "SET_OPEN_CONNECTION", key: status.key, name: e.target.value})}
                />
                <button type="button" className="remove-entry" onClick={() => dispatch({type: "REMOVE_OPEN_CONNECTION", key: status.key})}>
                  Remove
                </button>
              </div>
            )}
            {status.type === "zoneLink" && (
              <div className="zone-connection-status">
                {/* oneWay/requiredKey are ignored for now - every zoneLink
                    is assumed two-way and keyless (see plans/zone-editor.md). */}
                <span className="zone-connection-status-label">
                  Linked to {connectionKey(status.otherSide?.map, status.otherSide?.connection)}
                </span>
                <button type="button" className="remove-entry" onClick={() => dispatch({type: "REMOVE_ZONE_LINK", index: status.linkIndex})}>
                  Remove Link
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
