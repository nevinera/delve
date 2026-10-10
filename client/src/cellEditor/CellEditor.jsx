import {useEffect, useRef, useState} from "react";
import {cachedCellMapImage, renderScale} from "../cellMap/render";
import {cellCorners, mapSize} from "../cellMap/hexGrid";
import {TERRAINS, validateCellMap} from "../cellMap/format";
import clearing from "../cellMap/examples/clearing.json";
import forestEdge from "../cellMap/examples/forest-edge.json";
import woodlandTrail from "../cellMap/examples/woodland-trail.json";

export const EXAMPLES = {clearing, "forest-edge": forestEdge, "woodland-trail": woodlandTrail};

const PIXELS_PER_FOOT = 10;

// What the overlay shows on top of the render: nothing, the hex outlines, or
// every cell filled with its terrain's color.
export const OVERLAYS = {none: "None", grid: "Grid", cells: "Cells"};

const CELL_COLORS = {meadow: "rgba(250, 220, 90, 0.55)", trees: "rgba(30, 110, 200, 0.55)"};

// Slice 1 of the cell editor (plans/cell-editor.md): view the hand-made
// examples rendered, with a seed to re-roll and a grid to check them against.
export default function CellEditor({backUrl}) {
  const [exampleKey, setExampleKey] = useState("clearing");
  const [seed, setSeed] = useState(EXAMPLES.clearing.seed);
  const [overlay, setOverlay] = useState("none");
  const [status, setStatus] = useState("");
  const mapCanvas = useRef(null);
  const gridCanvas = useRef(null);

  const map = {...EXAMPLES[exampleKey], seed};
  const errors = validateCellMap(map);
  const mapKey = JSON.stringify(map);

  useEffect(() => {
    if (errors.length) return;
    let cancelled = false;
    const started = performance.now();
    cachedCellMapImage(map, {pixelsPerFoot: PIXELS_PER_FOOT}).then(({image, source}) => {
      if (cancelled) return;
      const canvas = mapCanvas.current;
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext("2d").drawImage(image, 0, 0);
      setStatus(`${source === "rendered" ? "Rendered" : `From ${source} cache`} in ${Math.round(performance.now() - started)}ms (${image.width}×${image.height})`);
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
    setSeed(EXAMPLES[key].seed);
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
            {Object.entries(TERRAINS).map(([ch, terrain]) => (
              <span key={ch}><i style={{background: CELL_COLORS[terrain]}} />{terrain}</span>
            ))}
          </span>
        )}
        <span className="cell-editor-status">{status}</span>
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

function drawOverlay(ctx, map, scale, filled) {
  const {grid} = map;
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
        ctx.fillStyle = CELL_COLORS[TERRAINS[map.cells[row][col]]];
        ctx.fill();
      }
      ctx.stroke();
    }
  }
}
