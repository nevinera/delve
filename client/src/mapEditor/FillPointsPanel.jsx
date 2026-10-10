import {useState} from "react";

// Points marking areas inside the walls as filled - raised and impassable,
// like everything outside them (see game/mapFill.js). The canvas shades
// the fill as it stands (FillShapes), so it's clear which area a point
// will take. "+ Add Fill Point" arms MapCanvas's one-click "add-fill-point"
// tool, the same way "+ Add Circle" arms "add-circle".

function round1(n) {
  return Math.round(n * 10) / 10;
}

export default function FillPointsPanel({fillPoints, tool, canAdd, onStartAdd, onHover, dispatch}) {
  // Collapsed to start, like Barriers.
  const [collapsed, setCollapsed] = useState(true);
  const armed = tool === "add-fill-point";

  function remove(index) {
    dispatch({type: "REMOVE_ENTRY", section: "fillPoints", index});
    onHover?.(null);
  }

  return (
    <>
      <div className="map-sidebar-section-heading" onClick={() => setCollapsed((c) => !c)}>
        <span className="map-sidebar-section-toggle">{collapsed ? "▸" : "▾"}</span>
        <h3>Fill Points{fillPoints.length > 0 ? ` (${fillPoints.length})` : ""}</h3>
      </div>
      {!collapsed && (
        <>
          <div className="add-buttons-row">
            <button type="button" className="add-entry" disabled={!canAdd} onClick={(e) => { e.stopPropagation(); onStartAdd?.(); }}>
              + Add Fill Point
            </button>
          </div>
          {fillPoints.length === 0 && !armed
            ? <p className="map-editor-sidebar-placeholder">The area outside the walls fills itself. Add a point to fill a void inside them too.</p>
            : (
              <div className="map-fill-point-pills">
                {fillPoints.map((p, i) => (
                  <span key={i} className="map-point-pill" onMouseEnter={() => onHover?.(i)} onMouseLeave={() => onHover?.(null)}>
                    ({round1(p.x)}, {round1(p.y)})
                    <button type="button" className="map-point-pill-remove" aria-label={`Remove fill point ${i + 1}`} onClick={() => remove(i)}>×</button>
                  </span>
                ))}
                {armed && <span className="map-point-pill map-point-pill-pending">…</span>}
              </div>
            )}
        </>
      )}
    </>
  );
}
