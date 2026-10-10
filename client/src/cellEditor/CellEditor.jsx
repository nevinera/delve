import {useEffect, useRef, useState} from "react";
import {cachedCellMapImage, renderScale} from "../cellMap/render";
import {cellCorners, mapSize} from "../cellMap/hexGrid";
import {validateCellMap} from "../cellMap/format";
import clearing from "../cellMap/examples/clearing.json";
import forestEdge from "../cellMap/examples/forest-edge.json";
import woodlandTrail from "../cellMap/examples/woodland-trail.json";

export const EXAMPLES = {clearing, "forest-edge": forestEdge, "woodland-trail": woodlandTrail};

const PIXELS_PER_FOOT = 10;

// Slice 1 of the cell editor (plans/cell-editor.md): view the hand-made
// examples rendered, with a seed to re-roll and a grid to check them against.
export default function CellEditor({backUrl}) {
  const [exampleKey, setExampleKey] = useState("clearing");
  const [seed, setSeed] = useState(EXAMPLES.clearing.seed);
  const [showGrid, setShowGrid] = useState(false);
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
    if (showGrid) drawGrid(canvas.getContext("2d"), map.grid, scale);
  }, [mapKey, showGrid]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid
        </label>
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

function drawGrid(ctx, grid, scale) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = 1 / scale;
  ctx.beginPath();
  for (let col = 0; col < grid.cols; col++) {
    for (let row = 0; row < grid.rows; row++) {
      const corners = cellCorners(col, row, grid.cellSize);
      ctx.moveTo(corners[0].x, corners[0].y);
      for (const {x, y} of corners.slice(1)) ctx.lineTo(x, y);
      ctx.closePath();
    }
  }
  ctx.stroke();
}
