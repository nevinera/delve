import {useState} from "react";
import ZoneMapConnectionsPanel from "./ZoneMapConnectionsPanel";

// A zone's maps are always $ref entries in real content (see
// plans/zone-editor.md) - "./<key>/<key>.json", the same basename-matched
// convention Build::MapsController's #map_path already uses. An inline Map
// object (allowed by the schema, never produced by this editor) is treated
// as unresolvable-by-key here - just falls back to showing its own `name`.
function keyFromRef(ref) {
  return ref.replace(/^\.\//, "").split("/")[0];
}

function refFromKey(key) {
  return `./${key}/${key}.json`;
}

export default function ZoneMapsPanel({zoneData, dispatch, mapDetailsByKey, zoneKey, newMapUrl, onRefresh, refreshStatus}) {
  const [collapsed, setCollapsed] = useState(false);
  const [pendingKey, setPendingKey] = useState("");
  // Which map rows have their connections list expanded - starts empty
  // (all collapsed), same as every other per-entry collapse in this app.
  const [expandedIndexes, setExpandedIndexes] = useState(() => new Set());

  function toggleExpanded(index) {
    setExpandedIndexes((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const rows = zoneData.maps.map((entry, index) => {
    const ref = entry?.$ref;
    const key = ref ? keyFromRef(ref) : null;
    const detail = key ? mapDetailsByKey[key] : null;
    const name = detail?.name ?? entry?.name ?? key ?? "(unresolved reference)";
    return {index, key, detail, name};
  });
  const referencedKeys = new Set(rows.map((row) => row.key).filter(Boolean));
  const availableKeys = Object.keys(mapDetailsByKey).filter((key) => !referencedKeys.has(key));

  function handleRemove(index, mapIdentifier) {
    dispatch({type: "REMOVE_MAP", index, mapIdentifier});
  }

  function handleAdd() {
    if (!pendingKey) return;
    dispatch({type: "ADD_ENTRY", section: "maps", entry: {$ref: refFromKey(pendingKey), referenceTo: "map"}});
    setPendingKey("");
  }

  const createMapHref = `${newMapUrl}?prefix=${encodeURIComponent(`${zoneKey}/`)}`;

  return (
    <div className="zone-maps-panel">
      <div className="map-sidebar-section-heading" onClick={() => setCollapsed((c) => !c)}>
        <span className="map-sidebar-section-toggle">{collapsed ? "▸" : "▾"}</span>
        <h3>Maps ({rows.length})</h3>
      </div>
      {!collapsed && (
        <div className="zone-maps-list">
          {rows.length === 0 && <p className="map-sidebar-hint">No maps yet.</p>}
          {rows.map(({index, detail, name}) => {
            const expanded = expandedIndexes.has(index);
            return (
              <div className="entry-block zone-map-row" key={index}>
                <div className="entry-heading-row" onClick={() => toggleExpanded(index)}>
                  <div className="map-row-summary">
                    <span className="map-sidebar-section-toggle">{expanded ? "▾" : "▸"}</span>
                    {detail?.thumbnailUrl ? (
                      <img className="zone-map-thumb" src={detail.thumbnailUrl} alt={name} />
                    ) : (
                      <span className="zone-map-thumb-placeholder" aria-hidden="true">🗺</span>
                    )}
                    <span className="zone-map-name">{name}</span>
                  </div>
                  <button
                    type="button"
                    className="remove-entry"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(index, detail?.identifier);
                    }}
                  >
                    Remove
                  </button>
                </div>
                {expanded && (
                  <ZoneMapConnectionsPanel
                    mapIdentifier={detail?.identifier}
                    connections={detail?.connections ?? []}
                    zoneData={zoneData}
                    dispatch={dispatch}
                  />
                )}
              </div>
            );
          })}

          <div className="add-buttons-row">
            {availableKeys.length > 0 && (
              <>
                <select value={pendingKey} onChange={(e) => setPendingKey(e.target.value)}>
                  <option value="">Pick an existing map…</option>
                  {availableKeys.map((key) => (
                    <option key={key} value={key}>{mapDetailsByKey[key].name ?? key}</option>
                  ))}
                </select>
                <button type="button" className="add-entry" disabled={!pendingKey} onClick={handleAdd}>
                  Add
                </button>
              </>
            )}
            <a href={createMapHref} target="_blank" rel="noreferrer">Create Map ↗</a>
            <button type="button" className="add-entry" onClick={onRefresh}>Refresh</button>
            {refreshStatus && <span className="map-sidebar-unit-type-links">{refreshStatus}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
