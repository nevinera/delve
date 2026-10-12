import {useEffect, useState} from "react";
import AnnotationsSection from "../annotations/AnnotationsSection";
import ImagePicker from "../content/ImagePicker";
import {PositionButton} from "./MovementFields";

// Quest interactables (docs/schema/map.md#interactable): images players use
// for quests' use objectives. "+ Add Interactable" arms MapCanvas's
// single-shot "add-interactable" tool; dragging one on the map moves it,
// and its row's Position button places it (section "interactables").
// images {options, upload} feeds the image pickers; imageUrls maps a raw
// image URL to a displayable one.

const WHEN_UNAVAILABLE = [["hidden", "Hidden"], ["used", "Its used image"]];

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
  interactable, index, expanded, hovered, imageUrls, images, onRowClick, onHover, onRemove, update, unitPlacement, onStartUnitPlacement,
}) {
  const size = interactable.size ?? {};
  return (
    <div
      className={`entry-block map-unit-block map-interactable-block${expanded ? " map-unit-expanded" : ""}${hovered ? " map-entry-hovered" : ""}`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="entry-heading-row map-unit-row" onClick={() => onRowClick(index)}>
        <div className="map-unit-row-summary">
          <span className="map-sidebar-section-toggle">{expanded ? "▾" : "▸"}</span>
          {imageUrls[interactable.imageUrl] && <img className="map-unit-token-thumb map-unit-row-token" src={imageUrls[interactable.imageUrl]} alt="" />}
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
                  <th>Image</th>
                  <td>
                    <ImagePicker
                      label="Image" value={interactable.imageUrl} url={imageUrls[interactable.imageUrl]}
                      options={images.options} onUpload={images.upload} onChange={(v) => update(index, {imageUrl: v})}
                    />
                  </td>
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
                    <th>Used Image</th>
                    <td>
                      <ImagePicker
                        label="Used Image" value={interactable.usedImageUrl} url={imageUrls[interactable.usedImageUrl]}
                        options={images.options} onUpload={images.upload} onChange={(v) => update(index, {usedImageUrl: v})}
                      />
                    </td>
                  </tr>
                )}
                <tr>
                  <th>Size (ft)</th>
                  <td>
                    <NumberField label="Width" min="0.5" max="40" step="0.5" value={size.width} onChange={(v) => update(index, {size: {...size, width: v}})} />
                    {" x "}
                    <NumberField label="Height" min="0.5" max="40" step="0.5" value={size.height} onChange={(v) => update(index, {size: {...size, height: v}})} />
                  </td>
                </tr>
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
  interactables = [], imageUrls = {}, images = {options: []}, hoveredIndex, onHover, selectedIndex, onSelect,
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
              imageUrls={imageUrls} images={images}
              onRowClick={toggleExpanded} onHover={onHover} onRemove={remove} update={update}
              unitPlacement={unitPlacement?.section === "interactables" ? unitPlacement : null} onStartUnitPlacement={onStartUnitPlacement}
            />
          ))}
        </>
      )}
    </>
  );
}
