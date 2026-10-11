// Editor overlays drawn over a cellmap's render, in feet (the caller sets
// the scale): hex outlines, cells tinted by terrain, and trails as authored.
// Shared by the cell editor page and the map editor's Cells tab.
import {cellCorners, cellPoint} from "./hexGrid";
import {terrainsOf} from "./format";

export const TRAIL_COLOR = "rgba(230, 70, 30, 0.9)";
export const SELECTED_COLOR = "rgba(40, 140, 255, 0.95)";

export const CELL_COLORS = {
  meadow: "rgba(250, 220, 90, 0.55)",
  tallGrass: "rgba(120, 220, 60, 0.55)",
  marsh: "rgba(40, 200, 190, 0.55)",
  trees: "rgba(30, 110, 200, 0.55)",
};

export function hexPath(ctx, col, row, cellSize) {
  const corners = cellCorners(col, row, cellSize);
  ctx.moveTo(corners[0].x, corners[0].y);
  for (const {x, y} of corners.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
}

// Every cell's outline; with filled, tinted by its terrain. only(col, row)
// limits it to some cells.
export function drawCells(ctx, map, scale, {filled = false, outline = true, only = null, opacity = 1} = {}) {
  const {grid} = map;
  const terrains = terrainsOf(map);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = 1 / scale;
  if (filled) {
    // One path per terrain, so a big map is a handful of fills.
    const paths = new Map();
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        if (only && !only(col, row)) continue;
        const terrain = terrains[map.cells[row][col]];
        if (!paths.has(terrain)) paths.set(terrain, []);
        paths.get(terrain).push([col, row]);
      }
    }
    for (const [terrain, cells] of paths) {
      ctx.fillStyle = CELL_COLORS[terrain];
      ctx.beginPath();
      for (const [col, row] of cells) hexPath(ctx, col, row, grid.cellSize);
      ctx.fill();
    }
  }
  if (outline) {
    ctx.beginPath();
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) if (!only || only(col, row)) hexPath(ctx, col, row, grid.cellSize);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Trails as authored: straight lines between their points, each marked.
// selected is {trail, point} (either may be null).
export function drawTrails(ctx, map, scale, {selected = null} = {}) {
  const {cellSize} = map.grid;
  (map.trails ?? []).forEach((trail, t) => {
    const isSelected = selected?.trail === t;
    const color = isSelected ? SELECTED_COLOR : TRAIL_COLOR;
    const points = trail.points.map(([col, row]) => cellPoint(col, row, cellSize));
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3 / scale;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const {x, y} of points.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
    points.forEach(({x, y}, i) => {
      ctx.beginPath();
      ctx.arc(x, y, (isSelected && selected.point === i ? 9 : 6) / scale, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}
