import {useState} from "react";
import StampThumb from "./StampThumb";
import {isShareAlike, shareAlikeSetsUsed, stampFor} from "../../game/stamps";
import {MAX_SCALE, MIN_SCALE} from "./stampGeometry";

// The Stamps tab's sidebar (see useStampsTab): a palette per stamp set in
// the zone, the selected stamp's fields, and adding a set (renderSetAdder).
export default function StampsPanel({sets, sheets, stamps, armed, onArm, varyRotation, onVaryRotation, selected, onUpdate, onRemove, onMove, renderSetAdder}) {
  const [adding, setAdding] = useState(false);
  const setKeys = Object.keys(sets);
  const placed = selected !== null ? stamps[selected] : null;

  return (
    <div className="stamps-panel">
      <div className="map-sidebar-section-heading"><h3>Stamps</h3></div>
      <p className="stamps-help">
        Pick a stamp, then click the map to place it (it stays picked; Escape lets go). Drag a stamp to move it, its round
        handle to turn it (Shift snaps) and its square one to resize it. [ and ] turn it; Delete removes it.
      </p>
      {setKeys.length === 0 && <p className="stamps-empty">This zone has no stamp sets yet.</p>}
      {setKeys.map((setKey) => (
        <details key={setKey} className="stamp-palette" open>
          <summary>
            {sets[setKey].name || setKey}
            <span className={`stamp-license${isShareAlike(sets[setKey]) ? " share-alike" : ""}`} title={sets[setKey].attribution ?? ""}>
              {sets[setKey].license ?? "no license"}
            </span>
          </summary>
          {sets[setKey].attribution && <p className="stamp-attribution">{sets[setKey].attribution}</p>}
          <div className="stamp-palette-grid">
            {Object.entries(sets[setKey].stamps ?? {}).map(([key, stamp]) => {
              const id = `${setKey}/${key}`;
              return (
                <button
                  key={key} type="button" className={`stamp-palette-entry${armed === id ? " active" : ""}`}
                  aria-pressed={armed === id} title={stamp.name || key} onClick={() => onArm(id)}
                >
                  <StampThumb stamp={stamp} sheet={sheets[setKey]} />
                  <span>{stamp.name || key}</span>
                </button>
              );
            })}
          </div>
        </details>
      ))}
      {setKeys.length > 0 && (
        <label className="stamps-vary">
          <input type="checkbox" checked={varyRotation} onChange={(e) => onVaryRotation(e.target.checked)} /> Turn each placed stamp at random
        </label>
      )}
      {renderSetAdder && (adding
        ? renderSetAdder({close: () => setAdding(false)})
        : <button type="button" className="add-entry" onClick={() => setAdding(true)}>Add a stamp set…</button>)}
      <p className="stamps-count">{stamps.length} {stamps.length === 1 ? "stamp" : "stamps"} on this map</p>
      <ShareAlikeNote sets={sets} stamps={stamps} />
      {placed && <SelectedStamp sets={sets} placed={placed} index={selected} count={stamps.length} onUpdate={onUpdate} onRemove={onRemove} onMove={onMove} />}
    </div>
  );
}

function SelectedStamp({sets, placed, index, count, onUpdate, onRemove, onMove}) {
  const found = stampFor(sets, placed);
  const frames = found?.stamp.frames?.length ?? 1;
  const number = (field, fallback, {min, max} = {}) => (e) => {
    const value = Number(e.target.value);
    if (e.target.value === "" || !Number.isFinite(value)) return;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
    onUpdate(index, {[field]: clamped === fallback ? undefined : clamped});
  };
  return (
    <div className="stamp-selected">
      <div className="map-sidebar-section-heading"><h3>{found?.stamp.name || placed.stamp}</h3></div>
      {!found && <p className="zone-list-error">This zone has no stamp {placed.stamp}.</p>}
      <div className="stamp-fields">
        <label>X <input type="number" step="0.5" value={placed.x} onChange={number("x")} /></label>
        <label>Y <input type="number" step="0.5" value={placed.y} onChange={number("y")} /></label>
        <label>Rotation <input type="number" step="15" value={placed.rotation ?? 0} onChange={number("rotation", 0)} /></label>
        <label>Scale <input type="number" step="0.1" min={MIN_SCALE} max={MAX_SCALE} value={placed.scale ?? 1} onChange={number("scale", 1, {min: MIN_SCALE, max: MAX_SCALE})} /></label>
        {frames > 1 && (
          <label>
            Variant
            <select
              value={Number.isInteger(placed.variant) ? placed.variant : ""}
              onChange={(e) => onUpdate(index, {variant: e.target.value === "" ? undefined : Number(e.target.value)})}
            >
              <option value="">Picked by position</option>
              {Array.from({length: frames}, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="stamp-order">
        <button type="button" disabled={index === 0} onClick={() => onMove(index, 0)}>To back</button>
        <button type="button" disabled={index === 0} onClick={() => onMove(index, index - 1)}>Back</button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>Forward</button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(index, count - 1)}>To front</button>
      </div>
      <button type="button" className="remove-entry" onClick={() => onRemove(index)}>Remove stamp</button>
    </div>
  );
}

// Says when the map uses share-alike art, since images made from it are
// share-alike too.
function ShareAlikeNote({sets, stamps}) {
  const used = shareAlikeSetsUsed(sets, stamps);
  if (!used.length) return null;
  return (
    <p className="stamps-share-alike">
      Uses share-alike art ({used.map((set) => sets[set].name || set).join(", ")}): any image of this map that's published
      (a thumbnail, a screenshot) must be shared under the same license, with credit.
    </p>
  );
}
