// The Cells tab's sidebar: start a cell map, pick a tool, terrain and brush,
// edit trails, the grid, seed and colors. All state is in useCellsTab.
import {useState} from "react";
import {THEMES, terrainsOf} from "../../cellMap/format";
import {gridFor} from "../../cellMap/hexGrid";
import {CELL_COLORS} from "../../cellMap/overlay";
import {CellMapDraft} from "./CellMapDraft";
import {BRUSHES, OVERLAYS, TOOLS} from "./useCellsTab";

const DEFAULT_CELL_SIZE = 5;

export default function CellsPanel({cells, feetDimensions, hasImage}) {
  const {draft, change, history, ui, update, errors, pending, render} = cells;
  if (!draft) return <NewCellMap feetDimensions={feetDimensions} onCreate={(created) => change(() => created)} />;
  const terrains = terrainsOf(draft.data);

  return (
    <div className="cells-panel">
      {hasImage && <p className="cells-panel-note">This map has an image, so these cells aren&apos;t shown in play. Remove the image to use them.</p>}
      <div className="cells-panel-row">
        <button type="button" disabled={!history.canUndo} onClick={history.undo}>Undo</button>
        <button type="button" disabled={!history.canRedo} onClick={history.redo}>Redo</button>
        <span className="cells-panel-status">{errors.length ? "Not rendered" : pending ? "Rendering…" : render ? `Rendered in ${Math.round(render.total)}ms` : ""}</span>
      </div>
      {errors.length > 0 && <ul className="cells-panel-errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}

      <Choices label="Tool" options={TOOLS} value={ui.tool} onChange={(tool) => update({tool, pendingPoint: null})} />
      {(ui.tool === "paint" || ui.tool === "fill") && (
        <>
          <div className="cells-panel-row" role="group" aria-label="Terrain">
            {Object.entries(terrains).map(([ch, terrain]) => (
              <button key={ch} type="button" aria-pressed={ui.terrain === ch} className={ui.terrain === ch ? "active" : ""} onClick={() => update({terrain: ch})}>
                <i className="cells-panel-swatch" style={{background: CELL_COLORS[terrain]}} />{terrain}
              </button>
            ))}
          </div>
          {ui.tool === "paint" && (
            <Choices label="Brush" options={Object.fromEntries(BRUSHES.map((b) => [b, `${b}`]))} value={String(ui.brush)} onChange={(b) => update({brush: Number(b)})} />
          )}
        </>
      )}
      {ui.tool === "trail" && <TrailsSection cells={cells} />}
      <Choices label="Overlay" options={OVERLAYS} value={ui.overlay} onChange={(overlay) => update({overlay})} />

      <GridSection draft={draft} change={change} />
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
  const [cellSize, setCellSize] = useState(DEFAULT_CELL_SIZE);
  const [size, setSize] = useState(() => (fits ? gridFor(feetDimensions, DEFAULT_CELL_SIZE) : {cols: 48, rows: 36}));
  const [theme, setTheme] = useState(Object.keys(THEMES)[0]);
  return (
    <div className="cells-panel">
      <p>This map has no cells yet. Start one, all meadow, and paint it.</p>
      <label>
        Theme{" "}
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          {Object.keys(THEMES).map((key) => <option key={key} value={key}>{key}</option>)}
        </select>
      </label>
      <div className="cells-panel-row">
        <NumberField label="Columns" value={size.cols} min={1} max={200} onChange={(cols) => setSize({...size, cols})} />
        <NumberField label="Rows" value={size.rows} min={1} max={200} onChange={(rows) => setSize({...size, rows})} />
        <NumberField label="Cell size (ft)" value={cellSize} min={1} step={0.5} onChange={setCellSize} />
      </div>
      {fits && (
        <button type="button" onClick={() => setSize(gridFor(feetDimensions, cellSize))}>Fit to the map ({feetDimensions.width} × {feetDimensions.height} ft)</button>
      )}
      <button type="button" onClick={() => onCreate(CellMapDraft.blank({theme, ...size, cellSize}))}>New cell map</button>
    </div>
  );
}

function GridSection({draft, change}) {
  const {cols, rows, cellSize} = draft.grid;
  const [next, setNext] = useState({cols, rows, cellSize});
  // Follows the grid when it changes underneath (an undo, say).
  const [current, setCurrent] = useState(draft.grid);
  if (current !== draft.grid) {
    setCurrent(draft.grid);
    setNext({cols, rows, cellSize});
  }
  const changed = next.cols !== cols || next.rows !== rows || next.cellSize !== cellSize;
  return (
    <div className="cells-panel-section">
      <h4>Grid</h4>
      <div className="cells-panel-row">
        <NumberField label="Columns" value={next.cols} min={1} max={200} onChange={(v) => setNext({...next, cols: v})} />
        <NumberField label="Rows" value={next.rows} min={1} max={200} onChange={(v) => setNext({...next, rows: v})} />
        <NumberField label="Cell size (ft)" value={next.cellSize} min={1} step={0.5} onChange={(v) => setNext({...next, cellSize: v})} />
      </div>
      {changed && (
        <div className="cells-panel-row">
          <button type="button" onClick={() => change((d) => d.resize(next))}>Resize</button>
          <button type="button" onClick={() => setNext({cols, rows, cellSize})}>Cancel</button>
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
      <p className="cells-panel-help">Click to extend the selected trail, or to start one. Drag a point to move it; Delete removes the selected point.</p>
      <button type="button" disabled={!ui.selected && !ui.pendingPoint} onClick={() => update({selected: null, pendingPoint: null})}>New trail</button>
      {ui.pendingPoint && <p className="cells-panel-help">Click again to place the trail&apos;s second point.</p>}
      <ul className="cells-panel-trails">
        {draft.trails.map((trail, t) => (
          <li key={t} className={ui.selected?.trail === t ? "active" : ""}>
            <button type="button" onClick={() => update({selected: {trail: t, point: null}, pendingPoint: null})}>Trail {t + 1} ({trail.points.length} points)</button>
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
