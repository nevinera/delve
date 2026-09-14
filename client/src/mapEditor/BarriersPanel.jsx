import {useState} from "react";

// Both "+ Add Wall" and "+ Add Circle" live here, at the top of the list.
// A wall starts as a blank slate (no points yet) and gets built up via the
// pill "+" buttons below (placement mode - see MapCanvas); a circle still
// needs a drag on the map to give it a center/radius, so its button just
// arms MapCanvas's single-shot "add-circle" tool instead of adding
// anything itself. Either way, this panel is the place for
// viewing/removing/reordering a barrier's fields, synced with canvas
// selection (see MapEditor's selectedBarrierIndex) - point positions
// themselves are only ever set by clicking the map (placement mode, below)
// or dragging a point's handle on canvas, not typed in.

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

// A wall's points render as a wrapping row of "pills" (coordinates + a
// remove button) with a "+" between/around them - clicking a "+" doesn't
// insert anything by itself, it starts *insert* placement mode (see
// MapCanvas): the *next* click on the map becomes a new point there, and
// placement then automatically advances to the gap right after it, so a
// run of clicks lays down consecutive points. Clicking a pill itself
// (not its "+"s or its own "×") starts *edit* placement mode instead - the
// next map click replaces just that point, then placement exits (no
// advancing, unlike insert). Either way, Escape or a click outside the map
// cancels - nothing was ever written for a not-yet-placed/edited point, so
// there's nothing to clean up.
function WallPoints({barrierIndex, locations, onChange, onHoverPoint, placement, onStartPlacement, onStartPointEdit}) {
  const barrierPlacementActive = placement?.barrierIndex === barrierIndex;
  const insertingAt = barrierPlacementActive && placement.mode !== "edit" ? placement.pointIndex : null;
  const editingIndex = barrierPlacementActive && placement.mode === "edit" ? placement.pointIndex : null;

  function removePoint(index, e) {
    e.stopPropagation();
    onChange(locations.filter((_, i) => i !== index));
    // The pill unmounts instead of firing a mouseleave - clear its hover
    // explicitly so a stale pointIndex doesn't briefly point past the
    // shrunk array (see BarrierShapes' matching defensive check).
    onHoverPoint(null);
  }

  function startPlacement(insertIndex, e) {
    e.stopPropagation();
    onStartPlacement(barrierIndex, insertIndex);
  }

  function startEdit(index, e) {
    e.stopPropagation();
    onStartPointEdit(barrierIndex, index);
  }

  function PlusButton({insertIndex}) {
    return (
      <button
        type="button" className="map-point-plus" disabled={barrierPlacementActive}
        onClick={(e) => startPlacement(insertIndex, e)}
      >
        +
      </button>
    );
  }

  const items = [];
  items.push(<PlusButton key="plus-0" insertIndex={0} />);
  locations.forEach((loc, i) => {
    if (insertingAt === i) {
      items.push(<span key={`pending-${i}`} className="map-point-pill map-point-pill-pending">…</span>);
    }
    items.push(
      editingIndex === i
        ? <span key={i} className="map-point-pill map-point-pill-pending">…</span>
        : (
          <span
            key={i} className="map-point-pill map-point-pill-editable"
            onMouseEnter={() => onHoverPoint(i)} onMouseLeave={() => onHoverPoint(null)}
            onClick={(e) => startEdit(i, e)}
          >
            {round1(loc.x)}, {round1(loc.y)}
            {locations.length > 2 && (
              <button type="button" className="map-point-pill-remove" onClick={(e) => removePoint(i, e)}>×</button>
            )}
          </span>
        )
    );
    items.push(<PlusButton key={`plus-${i + 1}`} insertIndex={i + 1} />);
  });
  if (insertingAt === locations.length) {
    items.push(<span key="pending-end" className="map-point-pill map-point-pill-pending">…</span>);
  }

  return <div className="map-point-pills">{items}</div>;
}

function CircleFields({barrier, onChange}) {
  return (
    <table>
      <tbody>
        <tr>
          <th>Center</th>
          <td className="map-fields-dimension-pair">
            <NumberField value={barrier.location?.x} onChange={(v) => onChange({...barrier, location: {...barrier.location, x: v}})} />
            <span>,</span>
            <NumberField value={barrier.location?.y} onChange={(v) => onChange({...barrier, location: {...barrier.location, y: v}})} />
          </td>
        </tr>
        <tr>
          <th>Radius</th>
          <td><NumberField value={barrier.radius} onChange={(v) => onChange({...barrier, radius: v})} /></td>
        </tr>
      </tbody>
    </table>
  );
}

function barrierSummary(barrier) {
  return barrier.type === "wall" ? `${barrier.locations.length} points` : `r=${barrier.radius}ft`;
}

export default function BarriersPanel({barriers, selectedIndex, onSelect, onHover, onHoverPoint, placement, onStartPlacement, onStartPointEdit, tool, onStartAddCircle, canPlaceOnMap, otherPlacementActive, dispatch}) {
  // The "Barriers" section as a whole starts collapsed - a list of every
  // point in every wall would otherwise dominate the sidebar before
  // there's much else to look at. Individual entries, once the section is
  // open, are small enough now (pills, not one row per point) not to need
  // their own collapse - every barrier's fields show at once.
  const [sectionCollapsed, setSectionCollapsed] = useState(true);

  function updateBarrier(index, nextBarrier) {
    Object.entries(nextBarrier).forEach(([field, value]) => {
      dispatch({type: "UPDATE_ENTRY_FIELD", section: "barriers", index, field, value});
    });
  }

  function removeBarrier(index) {
    dispatch({type: "REMOVE_ENTRY", section: "barriers", index});
    if (selectedIndex === index) onSelect(null);
  }

  function addWall() {
    dispatch({type: "ADD_ENTRY", section: "barriers", entry: {type: "wall", locations: []}});
    setSectionCollapsed(false);
    onSelect(barriers.length); // select+expand the new (last) entry right away
  }

  return (
    <>
      <div className="map-sidebar-section-heading" onClick={() => setSectionCollapsed((c) => !c)}>
        <span className="map-sidebar-section-toggle">{sectionCollapsed ? "▸" : "▾"}</span>
        <h3>Barriers{barriers.length > 0 ? ` (${barriers.length})` : ""}</h3>
      </div>
      {!sectionCollapsed && (
        <>
          <div className="add-buttons-row">
            <button type="button" className="add-entry" onClick={(e) => { e.stopPropagation(); addWall(); }}>+ Add Wall</button>
            <button
              type="button" className="add-entry" disabled={tool !== "select" || !!placement || !!otherPlacementActive || !canPlaceOnMap}
              onClick={(e) => { e.stopPropagation(); onStartAddCircle(); }}
            >
              + Add Circle
            </button>
          </div>
          {!canPlaceOnMap && <p className="map-sidebar-hint">Set feet dimensions (above) before placing barriers.</p>}
          {barriers.length === 0 && tool !== "add-circle"
            ? <p className="map-editor-sidebar-placeholder">No barriers yet - use the buttons above to add one.</p>
            : barriers.map((barrier, i) => {
              const selected = selectedIndex === i;
              return (
                <div
                  key={i}
                  className={`entry-block${selected ? " map-entry-selected" : ""}`}
                  onMouseEnter={() => onHover(i)}
                  onMouseLeave={() => onHover(null)}
                >
                  {/* Selecting (for canvas highlight/drag handles) lives on
                      the heading row only, not the whole block - otherwise
                      every click inside the fields below (a pill's remove
                      button, a "+") would bubble up and toggle it too. */}
                  <div className="entry-heading-row" onClick={() => onSelect(selected ? null : i)}>
                    <h3>Barrier {i + 1}: {barrier.type} <span className="map-entry-summary">({barrierSummary(barrier)})</span></h3>
                    <button type="button" className="remove-entry" onClick={(e) => { e.stopPropagation(); removeBarrier(i); }}>
                      Remove
                    </button>
                  </div>
                  {barrier.type === "wall"
                    ? (
                      <WallPoints
                        barrierIndex={i}
                        locations={barrier.locations}
                        onChange={(locations) => updateBarrier(i, {locations})}
                        onHoverPoint={(pointIndex) => onHoverPoint(pointIndex === null ? null : {barrierIndex: i, pointIndex})}
                        placement={placement}
                        onStartPlacement={onStartPlacement}
                        onStartPointEdit={onStartPointEdit}
                      />
                    )
                    : <CircleFields barrier={barrier} onChange={(next) => updateBarrier(i, next)} />}
                </div>
              );
            })}
          {/* Nothing is written to mapData until the drag on the map
              actually happens (see MapCanvas's commitCircle) - this is
              purely a "something's in progress" cue, at the position the
              real entry will land once placed (the list's end). */}
          {tool === "add-circle" && (
            <div className="entry-block map-entry-pending">
              <div className="entry-heading-row">
                <h3>Barrier {barriers.length + 1}: circle <span className="map-entry-summary">(placing…)</span></h3>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
