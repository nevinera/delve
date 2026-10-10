// Everything the painter draws, in feet: pure data, so it's testable and the
// same map always builds the same scene. Decorations are placements of a
// style's sprite variants: {x, y, radius, variant}.
import {cellCenter, mapSize, neighbor} from "./hexGrid";
import {hash01} from "./random";
import {terrainAt} from "./format";
import {insetLoop, regionLoops, smoothLoop} from "./regions";
import {GLADE} from "./style";

// The forest's dark mass only shows in the gaps between crowns, so it's
// smoothed gently (sharp wiggles turn into spikes when inset) and sits this
// far inside its cells, in cell sizes, so it doesn't poke out past them.
const FOREST_INSET = 0.25;
const FOREST_SMOOTHING = {irregularity: 0.2, roughness: 0};

// Cells this far past the grid still get decorations, so its ragged edge
// (which the map's rectangle reaches past) isn't bare.
const DECORATION_PAD = 1;

// Crowns fill a band along the forest's edge, one entry per cell of depth
// (the chance a cell that deep gets a crown); deeper in, the dark mass shows.
const BAND = [1, 0.85, 0.6];

export function buildScene(map, style = GLADE) {
  const {cellSize} = map.grid;
  const {seed} = map;
  const scene = {...mapSize(map.grid), cellSize, forest: [], crowns: [], patches: [], tufts: []};

  scene.forest = regionLoops(map, "trees").map((loop) => insetLoop(smoothLoop(loop, cellSize, seed, FOREST_SMOOTHING), FOREST_INSET * cellSize));

  const depth = forestDepths(map);
  eachCell(map, (col, row, terrain) => {
    const h = (salt) => hash01(seed, col, row, salt);
    const variant = (kind, salt) => Math.floor(h(salt) * style.variants[kind]);
    const {x, y} = cellCenter(col, row, cellSize);
    if (terrain === "trees") {
      const d = depth.get(`${col},${row}`);
      if (!(h(4) < BAND[d - 1])) return;
      if (d === 1) {
        // Edge crowns are pulled back from the open cells beside them, so
        // the forest ends about where its cells do.
        const pull = [0, 1, 2, 3, 4, 5]
          .filter((edge) => terrainAt(map, ...neighbor(col, row, edge)) !== "trees")
          .reduce((v, edge) => ({x: v.x - edgeDir(edge).x, y: v.y - edgeDir(edge).y}), {x: 0, y: 0});
        const l = Math.hypot(pull.x, pull.y) || 1;
        const cx = x + (h(1) - 0.5) * 0.2 * cellSize + (pull.x / l) * 0.18 * cellSize;
        const cy = y + (h(2) - 0.5) * 0.2 * cellSize + (pull.y / l) * 0.18 * cellSize;
        scene.crowns.push({x: cx, y: cy, radius: cellSize * (0.75 + 0.1 * h(3)), variant: variant("crowns", 7)});
      } else {
        scene.crowns.push({x: x + (h(1) - 0.5) * 0.5 * cellSize, y: y + (h(2) - 0.5) * 0.5 * cellSize, radius: cellSize * (0.8 + 0.25 * h(3)), variant: variant("crowns", 7)});
      }
    } else {
      if (h(10) < 0.15) {
        scene.patches.push({x: x + (h(11) - 0.5) * cellSize, y: y + (h(12) - 0.5) * cellSize, radius: cellSize * (1.2 + 1.2 * h(13)), variant: variant("patches", 14)});
      }
      if (h(30) < 0.65) {
        scene.tufts.push({x: x + (h(31) - 0.5) * 0.4 * cellSize, y: y + (h(32) - 0.5) * 0.4 * cellSize, radius: cellSize * (0.4 + 0.1 * h(33)), variant: variant("tufts", 34)});
      }
    }
  });
  // Painted top to bottom, so lower crowns overlap the ones behind them.
  scene.crowns.sort((a, b) => a.y - b.y || a.x - b.x);
  return scene;
}

// How many cells each decorated tree cell is from open ground (1 on the
// edge), up to one past the band; deeper cells count as that.
function forestDepths(map) {
  const {cols, rows} = map.grid;
  const reach = DECORATION_PAD + BAND.length;
  const inside = (c, r) => c >= -reach && c < cols + reach && r >= -reach && r < rows + reach;
  const depth = new Map();
  let frontier = [];
  for (let c = -reach; c < cols + reach; c++) {
    for (let r = -reach; r < rows + reach; r++) {
      if (terrainAt(map, c, r) !== "trees") frontier.push([c, r]);
    }
  }
  for (let d = 1; d <= BAND.length && frontier.length; d++) {
    const next = [];
    for (const [c, r] of frontier) {
      for (let edge = 0; edge < 6; edge++) {
        const [nc, nr] = neighbor(c, r, edge);
        const key = `${nc},${nr}`;
        if (!inside(nc, nr) || depth.has(key) || terrainAt(map, nc, nr) !== "trees") continue;
        depth.set(key, d);
        next.push([nc, nr]);
      }
    }
    frontier = next;
  }
  return {get: (key) => depth.get(key) ?? BAND.length + 1};
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
