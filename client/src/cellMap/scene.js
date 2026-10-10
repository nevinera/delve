// Everything the painter draws, in feet: pure data, so it's testable and the
// same map always builds the same scene.
import {cellCenter, mapSize, neighbor} from "./hexGrid";
import {hash01} from "./random";
import {terrainAt} from "./format";
import {insetLoop, regionLoops, smoothLoop} from "./regions";

// The forest's dark mass only shows in the gaps between crowns, so it's
// smoothed gently (sharp wiggles turn into spikes when inset) and sits this
// far inside its cells, in cell sizes, so it doesn't poke out past them.
const FOREST_INSET = 0.25;
const FOREST_SMOOTHING = {irregularity: 0.2, roughness: 0};

// Cells this far past the grid still get decorations, so its ragged edge
// (which the map's rectangle reaches past) isn't bare.
const DECORATION_PAD = 1;

export function buildScene(map) {
  const {cellSize} = map.grid;
  const {seed} = map;
  const scene = {...mapSize(map.grid), cellSize, forest: [], crowns: [], patches: [], tufts: []};

  scene.forest = regionLoops(map, "trees").map((loop) => insetLoop(smoothLoop(loop, cellSize, seed, FOREST_SMOOTHING), FOREST_INSET * cellSize));

  eachCell(map, (col, row, terrain) => {
    const h = (salt) => hash01(seed, col, row, salt);
    const {x, y} = cellCenter(col, row, cellSize);
    if (terrain === "trees") {
      // Crowns on the forest's edge are smaller and pulled back from the
      // open cells beside them, so the forest ends about where its cells do.
      const open = [0, 1, 2, 3, 4, 5].filter((edge) => terrainAt(map, ...neighbor(col, row, edge)) !== "trees");
      const pull = open.reduce((v, edge) => ({x: v.x - edgeDir(edge).x, y: v.y - edgeDir(edge).y}), {x: 0, y: 0});
      const pullLength = Math.hypot(pull.x, pull.y) || 1;
      const edgy = open.length > 0;
      const jitter = edgy ? 0.2 : 0.5;
      const cx = x + (h(1) - 0.5) * jitter * cellSize + (edgy ? (pull.x / pullLength) * 0.15 * cellSize : 0);
      const cy = y + (h(2) - 0.5) * jitter * cellSize + (edgy ? (pull.y / pullLength) * 0.15 * cellSize : 0);
      scene.crowns.push(crown(cx, cy, cellSize * (edgy ? 0.55 + 0.1 * h(3) : 0.62 + 0.22 * h(3)), h));
      const inward = [0, 1, 2, 3, 4, 5].filter((edge) => !open.includes(edge));
      if (h(4) < 0.3 && inward.length) {
        const dir = edgeDir(inward[Math.floor(h(5) * inward.length)]);
        scene.crowns.push(crown(x + dir.x * 0.45 * cellSize, y + dir.y * 0.45 * cellSize, cellSize * (0.4 + 0.15 * h(6)), (salt) => h(salt + 50)));
      }
    } else {
      if (h(10) < 0.15) {
        scene.patches.push({x: x + (h(11) - 0.5) * cellSize, y: y + (h(12) - 0.5) * cellSize, radius: cellSize * (1.2 + 1.2 * h(13)), light: h(14) < 0.5, shape: lumps(9, 0.18, h, 15)});
      }
      const tufts = Math.floor(h(30) * 3);
      for (let i = 0; i < tufts; i++) {
        scene.tufts.push({x: x + (h(31 + i * 3) - 0.5) * 0.8 * cellSize, y: y + (h(32 + i * 3) - 0.5) * 0.8 * cellSize, size: cellSize * (0.12 + 0.08 * h(33 + i * 3))});
      }
    }
  });
  // Painted top to bottom, so lower crowns overlap the ones behind them.
  scene.crowns.sort((a, b) => a.y - b.y || a.x - b.x);
  return scene;
}

function eachCell(map, fn) {
  const {cols, rows} = map.grid;
  for (let col = -DECORATION_PAD; col < cols + DECORATION_PAD; col++) {
    for (let row = -DECORATION_PAD; row < rows + DECORATION_PAD; row++) {
      fn(col, row, terrainAt(map, col, row));
    }
  }
}

// The unit direction from a cell's center across edge i.
function edgeDir(edge) {
  const a = (Math.PI / 6) * (2 * edge + 1);
  return {x: Math.cos(a), y: Math.sin(a)};
}

function crown(x, y, radius, h) {
  return {x, y, radius, tone: h(7), shape: lumps(11, 0.12, h, 20), highlight: lumps(8, 0.15, h, 40)};
}

// Radius multipliers for a lumpy circle of n points.
function lumps(n, amount, h, salt) {
  const phase = h(salt) * Math.PI * 2;
  const waves = 3 + Math.floor(h(salt + 1) * 3);
  return Array.from({length: n}, (_, i) => 1 + amount * (0.6 * Math.sin(waves * (i / n) * Math.PI * 2 + phase) + 0.8 * (h(salt + 2 + i) - 0.5)));
}
