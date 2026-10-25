import { groundRgb } from "../world/tileImage.js";

// Mesh data for one decoded tile, without three.js, so it can be tested. Vertices sit on cell
// centers every `step` cells. The last row and column come from the east and south neighbours
// when they're loaded, so neighbouring tiles meet without gaps; otherwise the edge cells repeat.
// Positions are feet relative to `origin`, to keep float32 coordinates small.

// neighbours: { east, south, southEast }, each a decoded tile or undefined.
export function terrainMesh(tile, neighbours, origin, step = 2) {
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
  return { positions, colors, indices: gridIndices(side, () => true) };
}

// River water: a sheet at the water surface over cells that hold river water. The sea is drawn
// separately as one flat plane at height 0, so cells at sea level are left out.
export function waterMesh(tile, neighbours, origin) {
  const grid = sampler(tile, neighbours);
  const side = tile.cells + 1;
  const positions = new Float32Array(side * side * 3);
  const wet = new Uint8Array(side * side);
  for (let b = 0; b < side; b++) {
    for (let a = 0; a < side; a++) {
      const v = b * side + a;
      const { t, k } = grid(a, b);
      const level = t.layers.water[k];
      const [x, z] = position(tile, a, b, origin);
      positions.set([x, Number.isNaN(level) ? 0 : level, z], v * 3);
      wet[v] = level > 0 ? 1 : 0;
    }
  }
  const indices = gridIndices(side, (v0, v1, v2) => wet[v0] && wet[v1] && wet[v2]);
  return indices.length ? { positions, indices } : null;
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
