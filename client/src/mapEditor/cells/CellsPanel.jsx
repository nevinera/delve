// The Cells tab's sidebar: start a cell map, pick a tool, terrain and brush,
// edit trails, the grid, seed and colors. All state is in useCellsTab.
import {useState} from "react";
import {THEMES, terrainLabel, terrainsOf} from "../../cellMap/format";
import {CELL_SIZE, gridFor, hexDistance} from "../../cellMap/hexGrid";
import {MAX_BRIDGE_LENGTH} from "../../cellMap/bridges";
import {DEFAULT_PATH, PATHS} from "../../cellMap/style";
import {CELL_COLORS} from "../../cellMap/overlay";
import {CellMapDraft} from "./CellMapDraft";
import {BRUSHES, OVERLAYS, TOOLS} from "./useCellsTab";

export default function CellsPanel({cells, feetDimensions, hasImage, onRemoveImage}) {
  const {draft, change, history, ui, update, errors, pending, render} = cells;
  if (!draft) return <NewCellMap feetDimensions={feetDimensions} onCreate={(created) => change(() => created)} />;
  const terrains = terrainsOf(draft.data);

  return (
    <div className="cells-panel">
      {hasImage && (
        <div className="cells-panel-note">
          This map has an image, so these cells aren&apos;t shown in play.{" "}
          {onRemoveImage && <button type="button" onClick={onRemoveImage}>Remove the image</button>}
        </div>
      )}
      <div className="cells-panel-row">
        <button type="button" disabled={!history.canUndo} onClick={history.undo}>Undo</button>
        <button type="button" disabled={!history.canRedo} onClick={history.redo}>Redo</button>
        <span className="cells-panel-status">{errors.length ? "Not rendered" : pending ? "Rendering…" : render ? `Rendered in ${Math.round(render.total)}ms` : ""}</span>
      </div>
      {errors.length > 0 && <ul className="cells-panel-errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}

      <Choices label="Tool" options={TOOLS} value={ui.tool} onChange={(tool) => update({tool, pendingPoint: null, newTrail: false, pendingBridge: null})} />
      {(ui.tool === "paint" || ui.tool === "fill") && (
        <>
          <div className="cells-panel-row" role="group" aria-label="Terrain">
            {Object.entries(terrains).map(([ch, terrain]) => (
              <button key={ch} type="button" aria-pressed={ui.terrain === ch} className={ui.terrain === ch ? "active" : ""} onClick={() => update({terrain: ch})}>
                <i className="cells-panel-swatch" style={{background: CELL_COLORS[terrain]}} />{terrainLabel(draft.data.theme, terrain)}
              </button>
            ))}
          </div>
          {ui.tool === "paint" && (
            <Choices label="Brush" options={Object.fromEntries(BRUSHES.map((b) => [b, `${b}`]))} value={String(ui.brush)} onChange={(b) => update({brush: Number(b)})} />
          )}
        </>
      )}
      {ui.tool === "trail" && <TrailsSection cells={cells} />}
      {ui.tool === "bridge" && <BridgesSection cells={cells} />}
      <Choices label="Overlay" options={OVERLAYS} value={ui.overlay} onChange={(overlay) => update({overlay})} />

      <GridSection draft={draft} change={change} />
      <div className="cells-panel-row">
        <label>
          Theme{" "}
          <select value={draft.data.theme} onChange={(e) => change((d) => d.setTheme(e.target.value))}>
            {Object.keys(THEMES).map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
        </label>
      </div>
      <div className="cells-panel-row">
        <label>
          Seed <input type="number" value={draft.data.seed} onChange={(e) => change((d) => d.setSeed(parseInt(e.target.value, 10) || 0), {group: "seed"})} />
        </label>
        <button type="button" onClick={() => change((d) => d.setSeed(Math.floor(Math.random() * 1_000_000)))}>Re-roll</button>
      </div>
      <ColorsSection draft={draft} change={change} />
    </div>
  );
}

function Choices({label, options, value, onChange}) {
  return (
    <div className="cells-panel-row" role="group" aria-label={label}>
      <span className="cells-panel-label">{label}</span>
      {Object.entries(options).map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value === key} className={value === key ? "active" : ""} onClick={() => onChange(key)}>{text}</button>
      ))}
    </div>
  );
}

function NewCellMap({feetDimensions, onCreate}) {
  const fits = feetDimensions?.width && feetDimensions?.height;
  const [size, setSize] = useState(() => (fits ? gridFor(feetDimensions) : {cols: 48, rows: 36}));
  const [theme, setTheme] = useState(Object.keys(THEMES)[0]);
  return (
    <div className="cells-panel">
      <p>This map has no cells yet. Start one, all trees (or rock, in a cave), and carve open ground out of it. Cells are {CELL_SIZE} ft across.</p>
      <label>
        Theme{" "}
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          {Object.keys(THEMES).map((key) => <option key={key} value={key}>{key}</option>)}
        </select>
      </label>
      <div className="cells-panel-row">
        <NumberField label="Columns" value={size.cols} min={1} max={200} onChange={(cols) => setSize({...size, cols})} />
        <NumberField label="Rows" value={size.rows} min={1} max={200} onChange={(rows) => setSize({...size, rows})} />
      </div>
      {fits && (
        <button type="button" onClick={() => setSize(gridFor(feetDimensions))}>Fit to the map ({feetDimensions.width} × {feetDimensions.height} ft)</button>
      )}
      <button type="button" onClick={() => onCreate(CellMapDraft.blank({theme, ...size}))}>New cell map</button>
    </div>
  );
}

function GridSection({draft, change}) {
  const {cols, rows} = draft.grid;
  const [next, setNext] = useState({cols, rows});
  // Follows the grid when it changes underneath (an undo, say).
  const [current, setCurrent] = useState(draft.grid);
  if (current !== draft.grid) {
    setCurrent(draft.grid);
    setNext({cols, rows});
  }
  const changed = next.cols !== cols || next.rows !== rows;
  return (
    <div className="cells-panel-section">
      <h4>Grid</h4>
      <div className="cells-panel-row">
        <NumberField label="Columns" value={next.cols} min={1} max={200} onChange={(v) => setNext({...next, cols: v})} />
        <NumberField label="Rows" value={next.rows} min={1} max={200} onChange={(v) => setNext({...next, rows: v})} />
      </div>
      {changed && (
        <p className="cells-panel-help">Rows come and go at the top and columns at the right, so walls, connections and units stay over the same cells.</p>
      )}
      {changed && (
        <div className="cells-panel-row">
          <button type="button" onClick={() => change((d) => d.resize(next))}>Resize</button>
          <button type="button" onClick={() => setNext({cols, rows})}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function TrailsSection({cells}) {
  const {draft, change, ui, update} = cells;
  return (
    <div className="cells-panel-section">
      <h4>Trails</h4>
      <p className="cells-panel-help">Click to extend the selected trail, or to start one. Drag a point to move it; Delete (the key or the button) removes the selected point. Points snap to other trails' points (hold Shift not to).</p>
      <div className="cells-panel-row">
        <button type="button" disabled={ui.newTrail} onClick={() => update({selected: null, pendingPoint: null, newTrail: true})}>New trail</button>
        <button type="button" disabled={ui.selected?.point == null} onClick={() => {
          change((d) => d.removeTrailPoint(ui.selected.trail, ui.selected.point));
          update({selected: null});
        }}>Delete point</button>
      </div>
      {ui.newTrail && <p className="cells-panel-help">Click to place the new trail&apos;s first point.</p>}
      {ui.pendingPoint && <p className="cells-panel-help">Click again to place the trail&apos;s second point.</p>}
      <ul className="cells-panel-trails">
        {draft.trails.map((trail, t) => (
          <li key={t} className={ui.selected?.trail === t ? "active" : ""}>
            <button type="button" onClick={() => update({selected: {trail: t, point: null}, pendingPoint: null, newTrail: false})}>Trail {t + 1} ({trail.points.length} points)</button>
            <select aria-label={`Trail ${t + 1}'s type`} value={trail.type ?? DEFAULT_PATH} onChange={(e) => change((d) => d.setTrailType(t, e.target.value))}>
              {THEMES[draft.data.theme].paths.map((type) => <option key={type} value={type}>{PATHS[type].label}</option>)}
            </select>
            <NumberField label="Width" value={trail.width} min={0.1} max={4} step={0.1} onChange={(w) => change((d) => d.setTrailWidth(t, w), {group: `width:${t}`})} />
            <button type="button" aria-label={`Delete trail ${t + 1}`} onClick={() => {
              change((d) => d.removeTrail(t));
              update({selected: null});
            }}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BridgesSection({cells}) {
  const {draft, change, ui, update} = cells;
  return (
    <div className="cells-panel-section">
      <h4>Bridges</h4>
      <p className="cells-panel-help">Click where a bridge starts, then where it ends: it runs straight along the cells, up to {MAX_BRIDGE_LENGTH} from its start. Start and end it on land. Click a bridge to select it; Delete removes it.</p>
      {ui.pendingBridge && <p className="cells-panel-help">Click again to place the bridge&apos;s other end (Escape cancels).</p>}
      <ul className="cells-panel-trails">
        {draft.bridges.map((bridge, b) => (
          <li key={b} className={ui.selectedBridge === b ? "active" : ""}>
            <button type="button" onClick={() => update({selectedBridge: b, pendingBridge: null})}>Bridge {b + 1} ({hexDistance(bridge.from, bridge.to)} cells)</button>
            <button type="button" aria-label={`Delete bridge ${b + 1}`} onClick={() => {
              change((d) => d.removeBridge(b));
              update({selectedBridge: null});
            }}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ColorsSection({draft, change}) {
  const defaults = THEMES[draft.data.theme].colors;
  const colors = draft.data.colors ?? {};
  return (
    <div className="cells-panel-section">
      <h4>Colors</h4>
      <div className="cells-panel-colors">
        {Object.entries(defaults).map(([key, fallback]) => (
          <label key={key}>
            <input type="color" value={colors[key] ?? fallback} onChange={(e) => change((d) => d.setColor(key, e.target.value), {group: `color:${key}`})} />
            {key}
            {key in colors && <button type="button" aria-label={`Reset ${key}`} onClick={() => change((d) => d.setColor(key, null))}>↺</button>}
          </label>
        ))}
      </div>
    </div>
  );
}

// Only reports whole numbers in range, so a half-typed value doesn't
// reach the map.
function NumberField({label, value, onChange, min, max, step = 1}) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
  }
  return (
    <label>
      {label}{" "}
      <input
        type="number" value={text} min={min} max={max} step={step}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n) && n >= min && (max === undefined || n <= max) && (step % 1 !== 0 || Number.isInteger(n))) {
            setShown(n);
            onChange(n);
          }
        }}
      />
    </label>
  );
}
