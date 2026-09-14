import {useState} from "react";

// "+ Add Unit" is two steps, unlike every other add-tool here: pick a unit
// type from the dropdown (this panel's own local state - it's not written
// anywhere until placed), then the button arms MapCanvas's single-shot
// "add-unit" tool the same way "+ Add Circle" does. A unit's position is
// only ever set by clicking the map (to place), dragging its token on
// canvas (to move), or clicking its Position pill here (to re-place via
// MapCanvas's `unitPlacement` - same pattern as a connection's
// CoordinateButton) - never typed.
//
// hostility is fixed to "hostile" and movement to {type: "still"} for
// every unit in this slice (no pickers yet - see the map editor plan's
// Slice 5/8). identifier isn't schema-required, but is part of the form
// already since Slice 7's unit groups will need it.
//
// unitType *is* editable, via UnitTypeSelect below - unlike position, this
// is typed/picked rather than set by interacting with the map, and an
// already-placed unit may need it corrected (e.g. a map authored before
// this editor existed, whose units carry zone-level aliases rather than a
// real unit_types/ key - see UnitShapes for why that key is what lets a
// unit's real token/tokenRadius resolve).

function TextField({value, onChange, placeholder}) {
  return <input type="text" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
}

// Falls back to the raw key when its details haven't been fetched yet (see
// MapEditor's unitTypeDetails - only keys actually in use, or picked from
// the dropdown, get their {name, tokenRadius, tokenImageUrl} loaded, so a
// repo with far more unit types than any one map uses doesn't pay to open
// every file just to build this list).
function unitTypeLabel(unitTypeDetails, unitTypeKey) {
  return unitTypeDetails[unitTypeKey]?.name || unitTypeKey;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// unitType is the real unit_types/ file key by convention (not a
// zone-level alias - a Map has no unitTypes dict of its own, see the map
// editor plan) - that's what lets a unit's real token image/tokenRadius
// resolve (see UnitShapes). A pre-existing map authored before this editor
// existed may have units whose unitType doesn't match any real key (e.g. a
// zone alias) - shown as an extra, clearly-marked option so picking a real
// one doesn't require already knowing to clear it first.
function UnitTypeSelect({value, availableUnitTypeKeys, unitTypeDetails, onChange}) {
  const isUnknown = value && !availableUnitTypeKeys.includes(value);
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}>
      <option value="">— choose —</option>
      {isUnknown && <option value={value}>{value} (not a real unit type)</option>}
      {availableUnitTypeKeys.map((key) => <option key={key} value={key}>{unitTypeLabel(unitTypeDetails, key)}</option>)}
    </select>
  );
}

// Same fallback (a plain hostility-colored dot) as UnitShapes uses on the
// map itself when there's no tokenImageUrl - not the same element/colors
// object (kept separate per this project's per-file convention), but the
// same idea, so the sidebar and canvas agree on what an unresolved/absent
// token looks like.
const HOSTILITY_COLORS = {hostile: "#e05a5a", neutral: "#d9b64a", friendly: "#5ac07a"};

function TokenThumb({unit, unitTypeDetails}) {
  const tokenImageUrl = unitTypeDetails[unit.unitType]?.tokenImageUrl;
  if (tokenImageUrl) {
    return <img className="map-unit-token-thumb" src={tokenImageUrl} alt="" />;
  }
  return (
    <div
      className="map-unit-token-thumb map-unit-token-thumb-fallback"
      style={{background: HOSTILITY_COLORS[unit.hostility] ?? HOSTILITY_COLORS.hostile}}
    />
  );
}

function PositionButton({unitIndex, position, unitPlacement, onStartUnitPlacement}) {
  const isPlacingHere = unitPlacement?.unitIndex === unitIndex;
  return (
    <button
      type="button" className={`map-point-pill map-unit-position-btn${isPlacingHere ? " map-point-pill-pending" : ""}`}
      disabled={isPlacingHere}
      onClick={() => onStartUnitPlacement(unitIndex)}
    >
      {isPlacingHere ? "…" : `${round1(position.x)}, ${round1(position.y)}`}
    </button>
  );
}

export default function UnitsPanel({
  units, selectedIndex, onSelect, onHover,
  availableUnitTypeKeys, unitTypeDetails, onChooseUnitType, newUnitTypeUrl, onRefreshUnitTypes, refreshStatus,
  tool, placement, canPlaceOnMap, pendingUnitType, onStartAddUnit,
  unitPlacement, onStartUnitPlacement, dispatch,
}) {
  const [sectionCollapsed, setSectionCollapsed] = useState(true);
  const [chosenUnitType, setChosenUnitType] = useState("");
  const toolBusy = tool !== "select" || !!placement || !!unitPlacement || !canPlaceOnMap;

  function updateUnit(index, fields) {
    Object.entries(fields).forEach(([field, value]) => {
      dispatch({type: "UPDATE_ENTRY_FIELD", section: "units", index, field, value});
    });
  }

  function removeUnit(index) {
    dispatch({type: "REMOVE_ENTRY", section: "units", index});
    if (selectedIndex === index) onSelect(null);
  }

  return (
    <>
      <div className="map-sidebar-section-heading" onClick={() => setSectionCollapsed((c) => !c)}>
        <span className="map-sidebar-section-toggle">{sectionCollapsed ? "▸" : "▾"}</span>
        <h3>Units{units.length > 0 ? ` (${units.length})` : ""}</h3>
      </div>
      {!sectionCollapsed && (
        <>
          <p className="map-sidebar-unit-type-links">
            <a href={newUnitTypeUrl} target="_blank" rel="noreferrer">+ New Unit Type</a>{" "}
            <button type="button" onClick={(e) => { e.stopPropagation(); onRefreshUnitTypes(); }}>Refresh</button>{" "}
            {refreshStatus}
          </p>
          <div className="add-buttons-row">
            <select
              value={chosenUnitType}
              onChange={(e) => { setChosenUnitType(e.target.value); onChooseUnitType(e.target.value); }}
            >
              <option value="">Choose unit type…</option>
              {availableUnitTypeKeys.map((key) => (
                <option key={key} value={key}>{unitTypeLabel(unitTypeDetails, key)}</option>
              ))}
            </select>
            <button
              type="button" className="add-entry" disabled={!chosenUnitType || toolBusy}
              onClick={(e) => { e.stopPropagation(); onStartAddUnit(chosenUnitType); }}
            >
              + Add Unit
            </button>
          </div>
          {!canPlaceOnMap && <p className="map-sidebar-hint">Set feet dimensions (above) before placing units.</p>}
          {units.length === 0 && tool !== "add-unit"
            ? <p className="map-editor-sidebar-placeholder">No units yet - pick a unit type above and click "+ Add Unit".</p>
            : units.map((unit, i) => {
              const selected = selectedIndex === i;
              return (
                <div
                  key={i}
                  className={`entry-block${selected ? " map-entry-selected" : ""}`}
                  onMouseEnter={() => onHover(i)}
                  onMouseLeave={() => onHover(null)}
                >
                  <div className="entry-heading-row" onClick={() => onSelect(selected ? null : i)}>
                    <h3>Unit {i + 1}: {unitTypeLabel(unitTypeDetails, unit.unitType)}</h3>
                    <button type="button" className="remove-entry" onClick={(e) => { e.stopPropagation(); removeUnit(i); }}>
                      Remove
                    </button>
                  </div>
                  <div className="map-unit-body">
                    <table>
                      <tbody>
                        <tr>
                          <th>Type</th>
                          <td>
                            <UnitTypeSelect
                              value={unit.unitType} availableUnitTypeKeys={availableUnitTypeKeys} unitTypeDetails={unitTypeDetails}
                              onChange={(v) => { updateUnit(i, {unitType: v}); onChooseUnitType(v); }}
                            />
                          </td>
                        </tr>
                        <tr>
                          <th>Identifier</th>
                          <td><TextField value={unit.identifier} placeholder="goblin_a" onChange={(v) => updateUnit(i, {identifier: v})} /></td>
                        </tr>
                        <tr>
                          <th>Position</th>
                          <td>
                            <PositionButton
                              unitIndex={i} position={unit.position}
                              unitPlacement={unitPlacement} onStartUnitPlacement={onStartUnitPlacement}
                            />
                          </td>
                        </tr>
                        <tr>
                          <th>HP</th>
                          <td>
                            <input
                              type="range" min="0" max="1" step="0.01" value={unit.currentHpFraction ?? 1}
                              onChange={(e) => updateUnit(i, {currentHpFraction: parseFloat(e.target.value)})}
                            />
                            {" "}{Math.round((unit.currentHpFraction ?? 1) * 100)}%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="map-unit-token-panel">
                      <TokenThumb unit={unit} unitTypeDetails={unitTypeDetails} />
                    </div>
                  </div>
                </div>
              );
            })}
          {/* Nothing is written to mapData until the map click actually
              happens (see MapCanvas) - this is purely a "something's in
              progress" cue, at the position the real entry will land once
              placed (the list's end). */}
          {tool === "add-unit" && (
            <div className="entry-block map-entry-pending">
              <div className="entry-heading-row">
                <h3>Unit {units.length + 1}: {unitTypeLabel(unitTypeDetails, pendingUnitType)} <span className="map-entry-summary">(placing…)</span></h3>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
