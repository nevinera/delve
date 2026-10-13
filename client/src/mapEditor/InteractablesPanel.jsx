import {useEffect, useState} from "react";
import AnnotationsSection from "../annotations/AnnotationsSection";
import {PositionButton} from "./MovementFields";
import StampThumb from "./stamps/StampThumb";
import {stampFor} from "../game/stamps";

// Quest interactables (docs/schema/map.md#interactable): stamps players use
// for quests' use objectives. "+ Add Interactable" arms MapCanvas's
// single-shot "add-interactable" tool; dragging one on the map moves it,
// and its row's Position button places it (section "interactables").
// stampLayer {sets, sheets} is the zone's stamps, which the pickers offer.

const WHEN_UNAVAILABLE = [["hidden", "Hidden"], ["used", "Shown as used"]];

// A pick of one of the zone's stamps, by set; none ("") offers noneLabel.
function StampPicker({label, value, stampLayer, onChange, noneLabel}) {
  const sets = stampLayer?.sets ?? {};
  const known = value && stampFor(sets, {stamp: value});
  return (
    <span className="interactable-stamp-picker">
      {known && <StampThumb stamp={known.stamp} sheet={stampLayer.sheets[known.set]} size={32} />}
      <select aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{noneLabel}</option>
        {value && !known && <option value={value}>{value} (not in this zone)</option>}
        {Object.entries(sets).map(([setKey, set]) => (
          <optgroup key={setKey} label={set.name || setKey}>
            {Object.entries(set.stamps ?? {}).map(([key, stamp]) => <option key={key} value={`${setKey}/${key}`}>{stamp.name || key}</option>)}
          </optgroup>
        ))}
      </select>
    </span>
  );
}

// Picks one of a stamp's frames, when it has more than one.
function VariantPicker({label, stamp, value, stampLayer, onChange}) {
  const frames = stamp && stampFor(stampLayer?.sets, {stamp})?.stamp.frames?.length;
  if (!(frames > 1)) return null;
  return (
    <select aria-label={label} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value) || undefined)}>
      {Array.from({length: frames}, (_, i) => <option key={i} value={i}>Variant {i + 1}</option>)}
    </select>
  );
}

function TextField({value, onChange, placeholder, label}) {
  return (
    <input
      type="text" aria-label={label} value={value ?? ""} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    />
  );
}

function NumberField({value, onChange, label, min, max, step = "any", placeholder}) {
  return (
    <input
      type="number" aria-label={label} min={min} max={max} step={step} value={value ?? ""} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
    />
  );
}

function InteractableRow({
  interactable, index, expanded, hovered, stampLayer, onRowClick, onHover, onRemove, update, unitPlacement, onStartUnitPlacement,
}) {
  const known = interactable.stamp && stampFor(stampLayer?.sets, {stamp: interactable.stamp});
  return (
    <div
      className={`entry-block map-unit-block map-interactable-block${expanded ? " map-unit-expanded" : ""}${hovered ? " map-entry-hovered" : ""}`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="entry-heading-row map-unit-row" onClick={() => onRowClick(index)}>
        <div className="map-unit-row-summary">
          <span className="map-sidebar-section-toggle">{expanded ? "▾" : "▸"}</span>
          {known && <StampThumb stamp={known.stamp} sheet={stampLayer.sheets[known.set]} variant={interactable.variant ?? 0} size={24} />}
          <span className="map-unit-row-name">{interactable.name || interactable.identifier || `Interactable ${index + 1}`}</span>
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
                  <td><TextField label="Identifier" value={interactable.identifier} placeholder="snare-1" onChange={(v) => update(index, {identifier: v ?? ""})} /></td>
                </tr>
                <tr>
                  <th>Name</th>
                  <td><TextField label="Name" value={interactable.name} placeholder="Goblin Snare" onChange={(v) => update(index, {name: v ?? ""})} /></td>
                </tr>
                <tr>
                  <th>Stamp</th>
                  <td>
                    <StampPicker label="Stamp" value={interactable.stamp} stampLayer={stampLayer} noneLabel="— pick a stamp —" onChange={(v) => update(index, {stamp: v ?? "", variant: undefined})} />
                    <VariantPicker label="Variant" stamp={interactable.stamp} value={interactable.variant} stampLayer={stampLayer} onChange={(v) => update(index, {variant: v})} />
                  </td>
                </tr>
                <tr>
                  <th>Scale</th>
                  <td><NumberField label="Scale" min="0.1" max="20" step="0.1" placeholder="1" value={interactable.scale} onChange={(v) => update(index, {scale: v === 1 ? undefined : v})} /></td>
                </tr>
                <tr>
                  <th>When unavailable</th>
                  <td>
                    <select aria-label="When unavailable" value={interactable.whenUnavailable ?? "hidden"} onChange={(e) => update(index, {whenUnavailable: e.target.value === "hidden" ? undefined : e.target.value})}>
                      {WHEN_UNAVAILABLE.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </td>
                </tr>
                {interactable.whenUnavailable === "used" && (
                  <tr>
                    <th>Used Stamp</th>
                    <td>
                      <StampPicker label="Used Stamp" value={interactable.usedStamp} stampLayer={stampLayer} noneLabel="Its stamp, grayed out" onChange={(v) => update(index, {usedStamp: v, usedVariant: undefined})} />
                      <VariantPicker label="Used Variant" stamp={interactable.usedStamp} value={interactable.usedVariant} stampLayer={stampLayer} onChange={(v) => update(index, {usedVariant: v})} />
                    </td>
                  </tr>
                )}
                <tr>
                  <th>Position</th>
                  <td>
                    <PositionButton
                      unitIndex={index} position={interactable.position}
                      unitPlacement={unitPlacement} onStartUnitPlacement={onStartUnitPlacement}
                    />
                  </td>
                </tr>
                <tr>
                  <th>Turn</th>
                  <td>
                    <input
                      type="range" min="0" max="359" step="1" value={interactable.position.angle ?? 0}
                      onChange={(e) => update(index, {position: {...interactable.position, angle: parseFloat(e.target.value) || 0}})}
                    />
                    {" "}{Math.round(interactable.position.angle ?? 0)}°
                  </td>
                </tr>
                <tr>
                  <th>Use Time (s)</th>
                  <td><NumberField label="Use Time" min="0" max="30" step="0.5" placeholder="1" value={interactable.useTime} onChange={(v) => update(index, {useTime: v})} /></td>
                </tr>
                <tr>
                  <th>Use Text</th>
                  <td><TextField label="Use Text" value={interactable.useText} placeholder="Cutting" onChange={(v) => update(index, {useText: v})} /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <AnnotationsSection annotations={interactable.annotations} onChange={(v) => update(index, {annotations: v})} />
        </>
      )}
    </div>
  );
}

export default function InteractablesPanel({
  interactables = [], stampLayer = null, hoveredIndex, onHover, selectedIndex, onSelect,
  tool, placement, canPlaceOnMap, onStartAdd, dispatch, unitPlacement, onStartUnitPlacement,
}) {
  const [sectionCollapsed, setSectionCollapsed] = useState(false);
  const [expandedIndices, setExpandedIndices] = useState(() => new Set());
  const toolBusy = tool !== "select" || !!placement || !!unitPlacement || !canPlaceOnMap;

  // Selecting one on the map opens its row.
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
      dispatch({type: "UPDATE_ENTRY_FIELD", section: "interactables", index, field, value});
    });
  }

  function remove(index) {
    dispatch({type: "REMOVE_ENTRY", section: "interactables", index});
    onSelect?.(null);
    setExpandedIndices(new Set());
  }

  return (
    <>
      <div className="map-sidebar-section-heading" onClick={() => setSectionCollapsed((c) => !c)}>
        <span className="map-sidebar-section-toggle">{sectionCollapsed ? "▸" : "▾"}</span>
        <h3>Interactables{interactables.length > 0 ? ` (${interactables.length})` : ""}</h3>
      </div>
      {!sectionCollapsed && (
        <>
          <div className="add-buttons-row">
            <button type="button" className="add-entry" disabled={toolBusy} onClick={(e) => { e.stopPropagation(); onStartAdd(); }}>
              + Add Interactable
            </button>
          </div>
          {interactables.length === 0 && tool !== "add-interactable" && (
            <p className="map-editor-sidebar-placeholder">No interactables yet - things players use for quests (snares, totems). Click "+ Add Interactable", then the map.</p>
          )}
          {interactables.map((interactable, index) => (
            <InteractableRow
              key={index} interactable={interactable} index={index}
              expanded={expandedIndices.has(index)} hovered={hoveredIndex === index}
              stampLayer={stampLayer}
              onRowClick={toggleExpanded} onHover={onHover} onRemove={remove} update={update}
              unitPlacement={unitPlacement?.section === "interactables" ? unitPlacement : null} onStartUnitPlacement={onStartUnitPlacement}
            />
          ))}
        </>
      )}
    </>
  );
}
