import {useEffect, useState} from "react";
import DialogueFields from "./DialogueFields";
import {MovementFields, MovementTypeSelect, PositionButton} from "./MovementFields";

// Non-combat units (docs/schema/ncu.md): everything is set inline - no unit
// type to pick. "+ Add NCU" arms MapCanvas's single-shot "add-ncu" tool;
// position/movement editing is the same as a unit's (see MovementFields),
// with every placement tagged section "ncus".

function inNcusSection(placement) {
  return placement?.section === "ncus" ? placement : null;
}

function TextField({value, onChange, placeholder, label}) {
  return (
    <input
      type="text" aria-label={label} value={value ?? ""} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function NumberField({value, onChange, label, min, max, step = "any"}) {
  return (
    <input
      type="number" aria-label={label} min={min} max={max} step={step} value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
    />
  );
}

export function NcuTokenThumb({tokenUrl, className = "map-unit-token-thumb"}) {
  if (tokenUrl) return <img className={className} src={tokenUrl} alt="" />;
  return <span className={className} style={{background: "#b08a3e"}} />;
}

function NcuRow({
  ncu, index, expanded, hovered, tokenUrl, onRowClick, onHover, onRemove, update, dispatch,
  unitPlacement, onStartUnitPlacement,
  patrolStepPlacement, onStartPatrolStepPlacement, onStartPatrolStepEdit, onHoverPatrolStep,
  wanderLocationPlacement, onStartWanderLocationPlacement, onUpdateMovement,
}) {
  return (
    <div
      className={`entry-block map-unit-block map-ncu-block${expanded ? " map-unit-expanded" : ""}${hovered ? " map-entry-hovered" : ""}`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="entry-heading-row map-unit-row" onClick={() => onRowClick(index)}>
        <div className="map-unit-row-summary">
          <span className="map-sidebar-section-toggle">{expanded ? "▾" : "▸"}</span>
          <NcuTokenThumb tokenUrl={tokenUrl} className="map-unit-token-thumb map-unit-row-token" />
          <span className="map-unit-row-name">{ncu.name || ncu.identifier || `NCU ${index + 1}`}</span>
          {ncu.dialogue?.length > 0 && <span className="map-ncu-row-talk-icon" title="Has dialogue">💬</span>}
        </div>
        {expanded && (
          <button type="button" className="remove-entry" onClick={(e) => { e.stopPropagation(); onRemove(index); }}>
            Remove
          </button>
        )}
      </div>
      {expanded && (
        <>
          <div className="map-unit-body">
            <table>
              <tbody>
                <tr>
                  <th>Identifier</th>
                  <td><TextField label="Identifier" value={ncu.identifier} placeholder="grizzle" onChange={(v) => update(index, {identifier: v})} /></td>
                </tr>
                <tr>
                  <th>Name</th>
                  <td><TextField label="Name" value={ncu.name} placeholder="Grizzle" onChange={(v) => update(index, {name: v})} /></td>
                </tr>
                <tr>
                  <th>Token Image</th>
                  <td><TextField label="Token Image" value={ncu.tokenImageUrl} placeholder="../../tokens/unit/goblin-2.webp" onChange={(v) => update(index, {tokenImageUrl: v})} /></td>
                </tr>
                <tr>
                  <th>Token Radius</th>
                  <td><NumberField label="Token Radius" min="1" max="20" step="0.5" value={ncu.tokenRadius} onChange={(v) => update(index, {tokenRadius: v})} /></td>
                </tr>
                <tr>
                  <th>Speed Factor</th>
                  <td><NumberField label="Speed Factor" min="0" max="10" step="0.1" value={ncu.speedFactor} onChange={(v) => update(index, {speedFactor: v})} /></td>
                </tr>
                <tr>
                  <th>Position</th>
                  <td>
                    <PositionButton
                      unitIndex={index} position={ncu.position}
                      unitPlacement={unitPlacement} onStartUnitPlacement={onStartUnitPlacement}
                    />
                  </td>
                </tr>
                <tr>
                  <th>Facing</th>
                  <td>
                    <input
                      type="range" min="0" max="359" step="1" value={ncu.position.angle ?? 0}
                      onChange={(e) => update(index, {position: {...ncu.position, angle: parseFloat(e.target.value) || 0}})}
                    />
                    {" "}{Math.round(ncu.position.angle ?? 0)}°
                  </td>
                </tr>
                <tr>
                  <th>Movement</th>
                  <td><MovementTypeSelect unit={ncu} unitIndex={index} dispatch={dispatch} section="ncus" /></td>
                </tr>
              </tbody>
            </table>
            <div className="map-unit-token-panel">
              <NcuTokenThumb tokenUrl={tokenUrl} />
            </div>
          </div>
          <MovementFields
            unit={ncu} unitIndex={index}
            patrolStepPlacement={patrolStepPlacement} onStartPatrolStepPlacement={onStartPatrolStepPlacement} onStartPatrolStepEdit={onStartPatrolStepEdit}
            onHoverPatrolStep={onHoverPatrolStep}
            wanderLocationPlacement={wanderLocationPlacement} onStartWanderLocationPlacement={onStartWanderLocationPlacement}
            onUpdateMovement={onUpdateMovement}
          />
          <DialogueFields lines={ncu.dialogue} onChange={(v) => update(index, {dialogue: v})} />
        </>
      )}
    </div>
  );
}

export default function NcusPanel({
  ncus = [], tokenUrls = {}, hoveredIndex, onHover, selectedIndex, onSelect,
  tool, placement, canPlaceOnMap, onStartAddNcu, dispatch, onExpandedIndicesChange,
  unitPlacement, onStartUnitPlacement,
  patrolStepPlacement, onStartPatrolStepPlacement, onStartPatrolStepEdit, onHoverPatrolStep,
  wanderLocationPlacement, onStartWanderLocationPlacement, onUpdateMovement,
}) {
  const [sectionCollapsed, setSectionCollapsed] = useState(true);
  const [expandedIndices, setExpandedIndices] = useState(() => new Set());
  const toolBusy = tool !== "select" || !!placement || !!unitPlacement || !canPlaceOnMap;

  useEffect(() => {
    onExpandedIndicesChange?.(expandedIndices);
  }, [expandedIndices, onExpandedIndicesChange]);

  // Selecting an NCU's token on the map opens its row.
  useEffect(() => {
    if (selectedIndex == null) return;
    setSectionCollapsed(false);
    setExpandedIndices((current) => (current.has(selectedIndex) ? current : new Set(current).add(selectedIndex)));
  }, [selectedIndex]);

  function toggleExpanded(index) {
    setExpandedIndices((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    onSelect?.(index);
  }

  function update(index, fields) {
    Object.entries(fields).forEach(([field, value]) => {
      dispatch({type: "UPDATE_ENTRY_FIELD", section: "ncus", index, field, value});
    });
  }

  function remove(index) {
    dispatch({type: "REMOVE_ENTRY", section: "ncus", index});
    onSelect?.(null);
    setExpandedIndices(new Set());
  }

  return (
    <>
      <div className="map-sidebar-section-heading" onClick={() => setSectionCollapsed((c) => !c)}>
        <span className="map-sidebar-section-toggle">{sectionCollapsed ? "▸" : "▾"}</span>
        <h3>NCUs{ncus.length > 0 ? ` (${ncus.length})` : ""}</h3>
      </div>
      {!sectionCollapsed && (
        <>
          <div className="add-buttons-row">
            <button
              type="button" className="add-entry" disabled={toolBusy}
              onClick={(e) => { e.stopPropagation(); onStartAddNcu(); }}
            >
              + Add NCU
            </button>
          </div>
          {!canPlaceOnMap && <p className="map-sidebar-hint">Set feet dimensions (above) before placing NCUs.</p>}
          {ncus.length === 0 && tool !== "add-ncu" && (
            <p className="map-editor-sidebar-placeholder">No NCUs yet - click "+ Add NCU", then the map.</p>
          )}
          {ncus.map((ncu, index) => (
            <NcuRow
              key={index} ncu={ncu} index={index}
              expanded={expandedIndices.has(index)} hovered={hoveredIndex === index}
              tokenUrl={tokenUrls[ncu.tokenImageUrl]}
              onRowClick={toggleExpanded} onHover={onHover} onRemove={remove} update={update} dispatch={dispatch}
              unitPlacement={inNcusSection(unitPlacement)} onStartUnitPlacement={onStartUnitPlacement}
              patrolStepPlacement={inNcusSection(patrolStepPlacement)}
              onStartPatrolStepPlacement={onStartPatrolStepPlacement} onStartPatrolStepEdit={onStartPatrolStepEdit}
              onHoverPatrolStep={onHoverPatrolStep}
              wanderLocationPlacement={inNcusSection(wanderLocationPlacement)} onStartWanderLocationPlacement={onStartWanderLocationPlacement}
              onUpdateMovement={onUpdateMovement}
            />
          ))}
        </>
      )}
    </>
  );
}
