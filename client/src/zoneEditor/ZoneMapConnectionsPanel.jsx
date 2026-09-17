import {connectionStatus, connectionKey} from "./connectionStatus";

// One row per connection on a $ref'd map (see docs/schema/map.md's
// MapConnection) - read-only as far as the connection object itself
// (identifier/type/geometry stay owned by the map editor, which is the
// only place with a canvas to place them against - see
// plans/zone-editor.md step 4). What's editable here is purely zone-level:
// whether this connection is an entry point, an open connection, or one end
// of a zoneLink, and that link's own oneWay/requiredKey fields. Creating a
// *new* zoneLink is the graph's job (step 6, drag between ports) - this
// list only edits/removes one that already exists.
export default function ZoneMapConnectionsPanel({mapIdentifier, connections, zoneData, dispatch}) {
  if (!mapIdentifier || connections.length === 0) {
    return <p className="map-sidebar-hint">No connections on this map yet.</p>;
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
              </div>
            )}
            {status.type === "entryPoint" && (
              <div className="zone-connection-status">
                <span className="zone-connection-status-label">Entry point - required key:</span>
                <input
                  type="text"
                  placeholder="(none)"
                  value={status.requiredKey ?? ""}
                  onChange={(e) => dispatch({type: "SET_ENTRY_POINT", key: status.key, requiredKey: e.target.value || null})}
                />
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
                <span className="zone-connection-status-label">
                  Linked to {connectionKey(status.otherSide?.map, status.otherSide?.connection)}
                </span>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(status.oneWay)}
                    onChange={(e) => dispatch({type: "UPDATE_ZONE_LINK", index: status.linkIndex, field: "oneWay", value: e.target.checked})}
                  />
                  One-way
                </label>
                <input
                  type="text"
                  placeholder="required key (none)"
                  value={status.requiredKey ?? ""}
                  onChange={(e) => dispatch({type: "UPDATE_ZONE_LINK", index: status.linkIndex, field: "requiredKey", value: e.target.value || null})}
                />
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
