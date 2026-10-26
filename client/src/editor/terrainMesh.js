import { groundRgb } from "../world/tileImage.js";
import { decodeFlowDir, decodeFlowSlope } from "../world/generator.js";

// How fast running water moves, in ft/s: `still` where it has no flow, and from `base` up by
// `perRootSlope` times the square root of its surface's slope.
const FLOW_SPEED = { base: 1.5, perRootSlope: 30 };

// Mesh data for one decoded tile, without three.js, so it can be tested. Vertices sit on cell
// centers every `step` cells. The last row and column come from the east and south neighbours
// when they're loaded, so neighbouring tiles meet without gaps; otherwise the edge cells repeat.
// Positions are feet relative to `origin`, to keep float32 coordinates small.

// neighbours: { east, south, southEast }, each a decoded tile or undefined. `skirtFt` hangs a
// strip that deep down from the edges, so a coarse tile beside a finer one shows no cracks.
export function terrainMesh(tile, neighbours, origin, step = 2, { skirtFt = 0 } = {}) {
  const grid = sampler(tile, neighbours);
  const side = tile.cells / step + 1;
  const positions = new Float32Array(side * side * 3);
  const colors = new Float32Array(side * side * 3);
  for (let b = 0; b < side; b++) {
    for (let a = 0; a < side; a++) {
      const v = b * side + a;
      const [x, z] = position(tile, a * step, b * step, origin);
      const { t, k } = grid(a * step, b * step);
      positions.set([x, t.layers.height[k], z], v * 3);
      const rgb = groundRgb(t, k);
      colors.set([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255], v * 3);
    }
  }
  const mesh = { positions, colors, indices: gridIndices(side, () => true) };
  return skirtFt > 0 ? withSkirt(mesh, side, skirtFt) : mesh;
}

// The ground's kind and forest cover at each vertex of a full-detail terrainMesh, for the ground's
// patterns: two bytes per vertex, row by row, the first being `layerOf(terrain name)` and the
// second the forest cover. Also the scene position of the first vertex.
export function groundCells(tile, neighbours, origin, layerOf) {
  const grid = sampler(tile, neighbours);
  const side = tile.cells + 1;
  const data = new Uint8Array(side * side * 2);
  for (let b = 0; b < side; b++) {
    for (let a = 0; a < side; a++) {
      const { t, k } = grid(a, b);
      data[(b * side + a) * 2] = layerOf(t.palettes.terrain[t.layers.terrain[k]]);
      data[(b * side + a) * 2 + 1] = t.layers.forest[k];
    }
  }
  return { data, side, corner: position(tile, 0, 0, origin) };
}

// The mesh with a strip hanging `depth` down from each edge, facing both ways. The strip has its
// own vertices, so it doesn't bend the ground's lighting at the edge; `skirt` says which ground
// vertex each strip vertex copies, so the strip can be lit like the ground there.
function withSkirt({ positions, colors, indices }, side, depth) {
  const ring = [];
  for (let a = 0; a < side - 1; a++) ring.push(a);
  for (let b = 0; b < side - 1; b++) ring.push(b * side + side - 1);
  for (let a = side - 1; a > 0; a--) ring.push((side - 1) * side + a);
  for (let b = side - 1; b > 0; b--) ring.push(b * side);
  const count = positions.length / 3;
  const copies = [...ring, ...ring]; // the strip's top edge, then its bottom edge
  const outPositions = new Float32Array((count + copies.length) * 3);
  const outColors = new Float32Array((count + copies.length) * 3);
  outPositions.set(positions);
  outColors.set(colors);
  copies.forEach((v, n) => {
    const drop = n < ring.length ? 0 : depth;
    outPositions.set([positions[v * 3], positions[v * 3 + 1] - drop, positions[v * 3 + 2]], (count + n) * 3);
    outColors.set(colors.subarray(v * 3, v * 3 + 3), (count + n) * 3);
  });
  const strip = [];
  for (let n = 0; n < ring.length; n++) {
    const next = (n + 1) % ring.length;
    const [top, topNext, low, lowNext] = [count + n, count + next, count + ring.length + n, count + ring.length + next];
    strip.push(top, low, topNext, topNext, low, lowNext, top, topNext, low, topNext, lowNext, low);
  }
  return { positions: outPositions, colors: outColors, indices: Uint32Array.from([...indices, ...strip]), skirt: { from: count, copies } };
}

// A cell's kind of water (WATER_KINDS), or null where it's dry. Tiles from before the waterKind
// layer count water at level 0 as sea.
function kindOf(tile, k) {
  const level = tile.layers.water[k];
  if (Number.isNaN(level)) return null;
  if (tile.layers.waterKind && tile.palettes.water) return tile.palettes.water[tile.layers.waterKind[k]];
  return level === 0 ? "sea" : "fresh";
}

// One kind of water (WATER_KINDS), each drawn as its own mesh so each can look different: a sheet
// at the water surface over the cells holding that kind. The sheet runs on half a cell into the
// dry ground beside it, at the water's level there, so the ground itself cuts the shoreline. Null
// when the tile has none. Fresh water's vertices also get `flows`: its velocity (x, z, in ft/s) and
// how steeply it falls (0-1, from the tile's flowSlope), for rushing water (waterMaterial.js).
export function waterMesh(tile, neighbours, origin, kind = "fresh") {
  const grid = sampler(tile, neighbours);
  const side = tile.cells + 1;
  const level = new Float32Array(side * side).fill(NaN);
  for (let b = 0; b < side; b++) {
    for (let a = 0; a < side; a++) {
      const { t, k } = grid(a, b);
      if (kindOf(t, k) === kind) level[b * side + a] = t.layers.water[k];
    }
  }
  const positions = new Float32Array(side * side * 3);
  const usable = new Uint8Array(side * side);
  for (let b = 0; b < side; b++) {
    for (let a = 0; a < side; a++) {
      const v = b * side + a;
      let y = level[v];
      if (Number.isNaN(y)) {
        // A dry vertex takes the mean level of the wet ones around it.
        let sum = 0;
        let count = 0;
        for (let db = -1; db <= 1; db++) {
          for (let da = -1; da <= 1; da++) {
            const [na, nb] = [a + da, b + db];
            if (na < 0 || nb < 0 || na >= side || nb >= side) continue;
            const w = level[nb * side + na];
            if (Number.isNaN(w)) continue;
            sum += w;
            count++;
          }
        }
        y = count ? sum / count : NaN;
      }
      usable[v] = Number.isNaN(y) ? 0 : 1;
      const [x, z] = position(tile, a, b, origin);
      positions.set([x, usable[v] ? y : 0, z], v * 3);
    }
  }
  const wet = (v) => !Number.isNaN(level[v]);
  const indices = gridIndices(side, (v0, v1, v2) => usable[v0] && usable[v1] && usable[v2] && (wet(v0) || wet(v1) || wet(v2)));
  if (!indices.length) return null;
  return kind === "fresh" ? { positions, indices, flows: waterFlows(grid, side, level) } : { positions, indices };
}

// Each vertex's flow, as [vx, vz, steepness]. A vertex without a flow of its own (still water, or
// dry ground at the shore) takes the mean of the ones around it.
function waterFlows(grid, side, level) {
  const flows = new Float32Array(side * side * 3);
  const has = new Uint8Array(side * side);
  for (let b = 0; b < side; b++) {
    for (let a = 0; a < side; a++) {
      const { t, k } = grid(a, b);
      const v = b * side + a;
      const dir = !Number.isNaN(level[v]) && t.layers.flowDir ? decodeFlowDir(t.layers.flowDir[k]) : null;
      if (!dir) continue;
      const slope = decodeFlowSlope(t.layers.flowSlope[k]);
      const speed = FLOW_SPEED.base + FLOW_SPEED.perRootSlope * Math.sqrt(slope);
      flows.set([dir[0] * speed, dir[1] * speed, Math.sqrt(slope)], v * 3);
      has[v] = 1;
    }
  }
  for (let b = 0; b < side; b++) {
    for (let a = 0; a < side; a++) {
      const v = b * side + a;
      if (has[v]) continue;
      const sum = [0, 0, 0];
      let count = 0;
      for (let db = -1; db <= 1; db++) {
        for (let da = -1; da <= 1; da++) {
          const [na, nb] = [a + da, b + db];
          if (na < 0 || nb < 0 || na >= side || nb >= side || !has[nb * side + na]) continue;
          for (let c = 0; c < 3; c++) sum[c] += flows[(nb * side + na) * 3 + c];
          count++;
        }
      }
      if (count) flows.set(sum.map((s) => s / count), v * 3);
    }
  }
  return flows;
}

function position(tile, i, j, origin) {
  const [tx, tz] = tile.coords;
  return [tx * tile.cells * tile.cellFt + (i + 0.5) * tile.cellFt - origin[0], tz * tile.cells * tile.cellFt + (j + 0.5) * tile.cellFt - origin[1]];
}

// Finds the tile and cell index for a cell position that may run one past the tile's edge.
function sampler(tile, { east, south, southEast } = {}) {
  const n = tile.cells;
  return (i, j) => {
    const overI = i >= n;
    const overJ = j >= n;
    let t = tile;
    if (overI && overJ) t = southEast ?? tile;
    else if (overI) t = east ?? tile;
    else if (overJ) t = south ?? tile;
    const ii = overI ? (t === tile ? n - 1 : 0) : i;
    const jj = overJ ? (t === tile ? n - 1 : 0) : j;
    return { t, k: jj * n + ii };
  };
}

// Two triangles per grid square, kept when keep(v0, v1, v2) says so.
function gridIndices(side, keep) {
  const out = [];
  for (let b = 0; b < side - 1; b++) {
    for (let a = 0; a < side - 1; a++) {
      const v = b * side + a;
      const [v0, v1, v2, v3] = [v, v + 1, v + side, v + side + 1];
      if (keep(v0, v2, v1)) out.push(v0, v2, v1);
      if (keep(v1, v2, v3)) out.push(v1, v2, v3);
    }
  }
  return Uint32Array.from(out);
}
