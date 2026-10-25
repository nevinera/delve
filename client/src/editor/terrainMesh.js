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

// Kinds of water, each drawn as its own mesh so each can look different: the sea at level 0, and
// fresh water (rivers, lakes, pools) at any other level.
export const WATER_KINDS = ["sea", "fresh"];
const kindOf = (level) => (Number.isNaN(level) ? null : level === 0 ? "sea" : "fresh");

// One kind of water: a sheet at the water surface over the cells holding that kind. The sheet runs
// on half a cell into the dry ground beside it, at the water's level there, so the ground itself
// cuts the shoreline. Null when the tile has none.
export function waterMesh(tile, neighbours, origin, kind = "fresh") {
  const grid = sampler(tile, neighbours);
  const side = tile.cells + 1;
  const level = new Float32Array(side * side).fill(NaN);
  for (let b = 0; b < side; b++) {
    for (let a = 0; a < side; a++) {
      const { t, k } = grid(a, b);
      const w = t.layers.water[k];
      if (kindOf(w) === kind) level[b * side + a] = w;
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
