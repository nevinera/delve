// Writes surface_0_0.plate and ground.json, the fixtures ground_test.go reads: a plate written by the
// client's own codec, and the ground and water the client's walker finds at points on it.
//
//   node game-server/internal/worlds/testdata/plate.mjs
import fs from "fs";
import { decodePlate, encodePlate } from "../../../../client/src/world/plateCodec.js";

const CELLS = 64;
const CELL_FT = 8;
const here = new URL(".", import.meta.url);

// Tile 0,0 slopes gently east, then climbs a cliff past cell 40. Tile 1,0 has a lake in its west
// half, with a shallow rim, a dock (a structure) on its shore, and a boulder.
function tile(tx) {
  const height = new Float64Array(CELLS * CELLS);
  const water = new Float64Array(CELLS * CELLS).fill(NaN);
  for (let j = 0; j < CELLS; j++) {
    for (let i = 0; i < CELLS; i++) {
      const k = j * CELLS + i;
      if (tx === 0) height[k] = 10 + 0.25 * i + 0.1 * j + (i >= 40 ? 30 * (i - 39) : 0);
      else if (i < 20 && j < 40) {
        height[k] = i < 2 || j < 2 || j >= 38 || i >= 18 ? 3 : -10;
        water[k] = 5;
      } else height[k] = 6 + 0.05 * i;
    }
  }
  return {
    coords: [tx, 0],
    cells: CELLS,
    palettes: { terrain: ["grass"], biome: ["plains"] },
    layers: { height, water, terrain: new Uint8Array(CELLS * CELLS), biome: new Uint8Array(CELLS * CELLS), forest: new Uint8Array(CELLS * CELLS) },
    objects: tx === 1 ? [
      { type: "boulder", at: [700, 400], yaw: 0, scale: 1, footprint: { circle: 2 }, height: 3 },
      { type: "structure:dock0001", at: [672.5, 160.25], yaw: 0, scale: 1, footprint: { open: 24 }, height: 6 },
    ] : [],
  };
}

const text = encodePlate([0, 0], "surface", [tile(0), tile(1)], {
  boulder: { footprint: { circle: 2 }, height: 3 },
  "structure:dock0001": { footprint: { open: 24 }, height: 6, fixed: true },
});
fs.writeFileSync(new URL("surface_0_0.plate", here), text);

// The walker's groundAt and cell (client/src/editor/walker.js), on the decoded plate.
const tiles = new Map(decodePlate(text).tiles.map((t) => [t.coords.join(","), t]));
const cellAt = (ci, cj) => {
  const t = tiles.get(`${Math.floor(ci / CELLS)},${Math.floor(cj / CELLS)}`);
  if (!t) return null;
  const k = (cj - Math.floor(cj / CELLS) * CELLS) * CELLS + (ci - Math.floor(ci / CELLS) * CELLS);
  const w = t.layers.water[k];
  return { height: t.layers.height[k], water: Number.isNaN(w) ? null : w };
};
function groundAt(x, z) {
  const u = x / CELL_FT - 0.5;
  const v = z / CELL_FT - 0.5;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const h = (a, b) => cellAt(a, b)?.height ?? null;
  const c = [h(i, j), h(i + 1, j), h(i, j + 1), h(i + 1, j + 1)];
  if (c.some((x) => x === null)) return h(Math.round(u), Math.round(v));
  const fu = u - i;
  const fv = v - j;
  const top = c[0] + (c[1] - c[0]) * fu;
  const bottom = c[2] + (c[3] - c[2]) * fu;
  return top + (bottom - top) * fv;
}

const points = [[3, 3], [100.3, 77.7], [319, 200], [330.5, 12], [511.9, 40], [512.1, 40], [516, 516], [600, 100], [530, 8], [700, 400], [1020, 300], [1023.9, 3], [1030, 10], [-5, 10]];
const expected = points.map(([x, z]) => {
  const cell = cellAt(Math.floor(x / CELL_FT), Math.floor(z / CELL_FT));
  return { at: [x, z], ground: groundAt(x, z), water: cell?.water ?? null };
});
fs.writeFileSync(new URL("ground.json", here), `${JSON.stringify(expected, null, 1)}\n`);
