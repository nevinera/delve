import {useEffect, useRef, useState} from "react";
import {renderScale} from "../cellMap/render";
import {cachedCellMapImage} from "../cellMap/cache";
import {stressTestMap} from "../cellMap/examples/stressTest";
import {cellCorners, cellPoint, mapSize} from "../cellMap/hexGrid";
import {terrainsOf, validateCellMap} from "../cellMap/format";
import clearing from "../cellMap/examples/clearing.json";
import forestEdge from "../cellMap/examples/forest-edge.json";
import woodlandTrail from "../cellMap/examples/woodland-trail.json";

export const EXAMPLES = {
  clearing: {name: "Clearing", cellMap: clearing},
  "forest-edge": {name: "Forest edge", cellMap: forestEdge},
  "woodland-trail": {name: "Woodland trail", cellMap: woodlandTrail},
  "stress-test": {name: "Stress test (200×200)", cellMap: stressTestMap()},
};

const PIXELS_PER_FOOT = 10;

// What the overlay shows on top of the render: nothing, the hex outlines, or
// every cell filled with its terrain's color.
export const OVERLAYS = {none: "None", grid: "Grid", cells: "Cells"};

const TRAIL_COLOR = "rgba(230, 70, 30, 0.9)";

const CELL_COLORS = {
  meadow: "rgba(250, 220, 90, 0.55)",
  tallGrass: "rgba(120, 220, 60, 0.55)",
  marsh: "rgba(40, 200, 190, 0.55)",
  trees: "rgba(30, 110, 200, 0.55)",
};

// Slice 1 of the cell editor (plans/cell-editor.md): view the example maps
// rendered, with a seed to re-roll, an overlay to check them against, and
// how long each step of the render took.
export default function CellEditor({backUrl}) {
  const [exampleKey, setExampleKey] = useState("clearing");
  const [seed, setSeed] = useState(EXAMPLES.clearing.cellMap.seed);
  const [overlay, setOverlay] = useState("none");
  const [timing, setTiming] = useState(null);
  const mapCanvas = useRef(null);
  const gridCanvas = useRef(null);

  const map = {...EXAMPLES[exampleKey].cellMap, seed};
  const errors = validateCellMap(map);
  const mapKey = JSON.stringify(map);

  useEffect(() => {
    if (errors.length) return;
    let cancelled = false;
    const started = performance.now();
    setTiming(null);
    cachedCellMapImage(map, {pixelsPerFoot: PIXELS_PER_FOOT}).then(({image, source, timings, stats, stored}) => {
      if (cancelled) return;
      const shown = performance.now();
      const canvas = mapCanvas.current;
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext("2d").drawImage(image, 0, 0);
      const steps = {...timings, display: performance.now() - shown};
      setTiming({source, steps, stats, total: performance.now() - started});
      stored.then((done) => {
        if (!cancelled && done) setTiming((t) => t && {...t, steps: {...t.steps, encode: done.encode}});
      });
    });
    return () => {
      cancelled = true;
    };
  }, [mapKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (errors.length) return;
    const canvas = gridCanvas.current;
    const size = mapSize(map.grid);
    const scale = renderScale(size, PIXELS_PER_FOOT);
    canvas.width = Math.round(size.width * scale);
    canvas.height = Math.round(size.height * scale);
    if (overlay !== "none") drawOverlay(canvas.getContext("2d"), map, scale, overlay === "cells");
  }, [mapKey, overlay]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseExample = (key) => {
    setExampleKey(key);
    setSeed(EXAMPLES[key].cellMap.seed);
  };

  return (
    <div className="cell-editor">
      <header className="cell-editor-header">
        {backUrl && <a className="back-link" href={backUrl}>← Build</a>}
        <h1>Cell editor</h1>
      </header>
      <div className="cell-editor-controls">
        <label>
          Map{" "}
          <select value={exampleKey} onChange={(e) => chooseExample(e.target.value)}>
            {Object.entries(EXAMPLES).map(([key, example]) => (
              <option key={key} value={key}>{example.name}</option>
            ))}
          </select>
        </label>
        <label>
          Seed{" "}
          <input type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)} />
        </label>
        <button type="button" onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}>Re-roll</button>
        <label>
          Overlay{" "}
          <select value={overlay} onChange={(e) => setOverlay(e.target.value)}>
            {Object.entries(OVERLAYS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        {overlay === "cells" && (
          <span className="cell-editor-legend">
            {Object.entries(terrainsOf(map)).map(([ch, terrain]) => (
              <span key={ch}><i style={{background: CELL_COLORS[terrain]}} />{terrain}</span>
            ))}
            <span><i style={{background: TRAIL_COLOR}} />trail points</span>
          </span>
        )}
        {timing && <TimingReport {...timing} />}
      </div>
      {errors.length > 0 ? (
        <ul className="cell-editor-errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
      ) : (
        <div className="cell-editor-view">
          <canvas ref={mapCanvas} />
          <canvas ref={gridCanvas} className="cell-editor-grid" />
        </div>
      )}
    </div>
  );
}

const STEP_LABELS = {
  read: "read",
  decode: "decode",
  scene: "scene",
  sprites: "sprites",
  paint: "paint",
  transfer: "transfer",
  display: "display",
  encode: "encode (after)",
};

// The render's total time and each step's, in ms. Encoding for the cache
// happens after the map is shown, so it's listed but not in the total.
export function TimingReport({source, steps, stats, total}) {
  const ms = (v) => `${Math.round(v)}ms`;
  const where = source === "rendered" ? `Rendered (${steps.thread === "worker" ? "worker" : "main thread"})` : `From ${source} cache`;
  const parts = Object.entries(STEP_LABELS).filter(([key]) => steps[key] !== undefined).map(([key, label]) => `${label} ${ms(steps[key])}`);
  const counts = Object.entries(stats).filter(([k]) => k !== "width" && k !== "height");
  const sizes = [`${stats.width}×${stats.height}px`, ...counts.map(([k, n]) => `${n} ${k}`)];
  return (
    <span className="cell-editor-status">
      <strong>{where} in {ms(total)}</strong>
      {parts.length > 0 && <> · {parts.join(" · ")}</>}
      <span className="cell-editor-sizes">{sizes.join(", ")}</span>
    </span>
  );
}

function drawOverlay(ctx, map, scale, filled) {
  const {grid} = map;
  const terrains = terrainsOf(map);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = 1 / scale;
  for (let col = 0; col < grid.cols; col++) {
    for (let row = 0; row < grid.rows; row++) {
      const corners = cellCorners(col, row, grid.cellSize);
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (const {x, y} of corners.slice(1)) ctx.lineTo(x, y);
      ctx.closePath();
      if (filled) {
        ctx.fillStyle = CELL_COLORS[terrains[map.cells[row][col]]];
        ctx.fill();
      }
      ctx.stroke();
    }
  }
  // Trails as authored: straight lines between their points, each marked.
  if (!filled) return;
  ctx.strokeStyle = TRAIL_COLOR;
  ctx.fillStyle = TRAIL_COLOR;
  ctx.lineWidth = 3 / scale;
  for (const trail of map.trails ?? []) {
    const points = trail.points.map(([col, row]) => cellPoint(col, row, grid.cellSize));
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const {x, y} of points.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
    for (const {x, y} of points) {
      ctx.beginPath();
      ctx.arc(x, y, 6 / scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
