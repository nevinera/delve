import {useState} from "react";

// Both connection buttons ("+ Add Point Connection"/"+ Add Line
// Connection") arm a single-shot canvas tool (see MapCanvas) rather than
// adding anything directly here - a point connection's position and a line
// connection's start/end are only ever set by clicking/dragging the map,
// same convention as barriers' wall points. Only `identifier` (required,
// and what the zone editor will reference this connection by) and, for a
// point connection, `fuzzRadius`/`fuzzAngle`/facing `angle` are typed
// fields here.

function TextField({value, onChange, placeholder}) {
  return <input type="text" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
}

function NumberField({value, onChange}) {
  return (
    <input
      type="number" step="any" value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
    />
  );
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function connectionSummary(conn) {
  return conn.type === "point"
    ? `${round1(conn.position.x)}, ${round1(conn.position.y)}`
    : `${round1(conn.start.x)}, ${round1(conn.start.y)} → ${round1(conn.end.x)}, ${round1(conn.end.y)}`;
}

function PointConnectionFields({connection, onChange}) {
  return (
    <table>
      <tbody>
        <tr>
          <th>Position</th>
          <td>{round1(connection.position.x)}, {round1(connection.position.y)}</td>
        </tr>
        <tr>
          <th>Facing</th>
          <td><NumberField value={connection.position.angle} onChange={(v) => onChange({position: {...connection.position, angle: v}})} /></td>
        </tr>
        <tr>
          <th>Fuzz Radius</th>
          <td><NumberField value={connection.fuzzRadius} onChange={(v) => onChange({fuzzRadius: v})} /></td>
        </tr>
        <tr>
          <th>Fuzz Angle</th>
          <td><NumberField value={connection.fuzzAngle} onChange={(v) => onChange({fuzzAngle: v})} /></td>
        </tr>
      </tbody>
    </table>
  );
}

function LineConnectionFields({connection}) {
  return (
    <table>
      <tbody>
        <tr>
          <th>Start</th>
          <td>{round1(connection.start.x)}, {round1(connection.start.y)}</td>
        </tr>
        <tr>
          <th>End</th>
          <td>{round1(connection.end.x)}, {round1(connection.end.y)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default function ConnectionsPanel({connections, selectedIndex, onSelect, onHover, tool, placement, onStartAddPointConnection, onStartAddLineConnection, dispatch}) {
  const [sectionCollapsed, setSectionCollapsed] = useState(true);
  const toolBusy = tool !== "select" || !!placement;

  function updateConnection(index, nextFields) {
    Object.entries(nextFields).forEach(([field, value]) => {
      dispatch({type: "UPDATE_ENTRY_FIELD", section: "connections", index, field, value});
    });
  }

  function removeConnection(index) {
    dispatch({type: "REMOVE_ENTRY", section: "connections", index});
    if (selectedIndex === index) onSelect(null);
  }

  return (
    <>
      <div className="map-sidebar-section-heading" onClick={() => setSectionCollapsed((c) => !c)}>
        <span className="map-sidebar-section-toggle">{sectionCollapsed ? "▸" : "▾"}</span>
        <h3>Connections{connections.length > 0 ? ` (${connections.length})` : ""}</h3>
      </div>
      {!sectionCollapsed && (
        <>
          <div className="add-buttons-row">
            <button type="button" className="add-entry" disabled={toolBusy} onClick={(e) => { e.stopPropagation(); onStartAddPointConnection(); }}>
              + Add Point Connection
            </button>
            <button type="button" className="add-entry" disabled={toolBusy} onClick={(e) => { e.stopPropagation(); onStartAddLineConnection(); }}>
              + Add Line Connection
            </button>
          </div>
          {connections.length === 0
            ? <p className="map-editor-sidebar-placeholder">No connections yet - use the buttons above to add one.</p>
            : connections.map((connection, i) => {
              const selected = selectedIndex === i;
              return (
                <div
                  key={i}
                  className={`entry-block${selected ? " map-entry-selected" : ""}`}
                  onMouseEnter={() => onHover(i)}
                  onMouseLeave={() => onHover(null)}
                >
                  <div className="entry-heading-row" onClick={() => onSelect(selected ? null : i)}>
                    <h3>Connection {i + 1}: {connection.type} <span className="map-entry-summary">({connectionSummary(connection)})</span></h3>
                    <button type="button" className="remove-entry" onClick={(e) => { e.stopPropagation(); removeConnection(i); }}>
                      Remove
                    </button>
                  </div>
                  <table>
                    <tbody>
                      <tr>
                        <th>Identifier</th>
                        <td>
                          <TextField
                            value={connection.identifier} placeholder="landing_site"
                            onChange={(v) => updateConnection(i, {identifier: v})}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {connection.type === "point"
                    ? <PointConnectionFields connection={connection} onChange={(fields) => updateConnection(i, fields)} />
                    : <LineConnectionFields connection={connection} />}
                </div>
              );
            })}
        </>
      )}
    </>
  );
}
