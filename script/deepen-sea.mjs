// Gives a version 2 world's sea a floor, once: worlds made by convert-v2.mjs have ground flat at
// the sea's surface where the sea was. Ground at most FLAT_FT high that the sea reaches, from the
// edges of the tiles with no tile past them, is lowered by how far it is from the nearest ground
// that isn't: 1 ft for each 4 ft out to SHELF_FT down, then easing on down to DEEP_FT, a little
// uneven. Then the sea is put over it (v2/water.js), and the platters' renditions of the tiles
// moved made again. Ground the sea doesn't reach, and everything else, is left as it was.
//
//   node script/deepen-sea.mjs <world.zip> <out.zip>
import fs from "fs";
import { strFromU8, unzipSync, zipSync } from "fflate";
import { fbm } from "../client/src/world/noise.js";
import { CELL_CORNERS, PLATE_PATH, TILE_CELLS, decodePlate, encodePlate, platePath } from "../client/src/v2/plate.js";
import { CORNERS, PLATTER_PATH, decodePlatter, encodePlatter, indexIn, plateIndexIn, platterOf, platterPath } from "../client/src/v2/platter.js";
import { hash64, plateRendition } from "../client/src/v2/rendition.js";
import { CELL_FT, PLATE_TILES, PLATTER_PLATES, TILE_CHUNKS } from "../client/src/v2/sizes.js";
import { AROUND, WATER_TYPES, WaterMap, bakeWater, dryWater, waterPath } from "../client/src/v2/water.js";

const FLAT_FT = 0.5; // ground this high or lower is taken as the sea's
const SLOPE = 1 / 4; // ft down for each ft out, near the shore
const SHELF_FT = 50;
const DEEP_FT = 100;
const DEEP_OUT_FT = 1000; // how far out the sea's DEEP_FT down
const UNEVEN = { share: 0.15, wavelength: 300, octaves: 3, seed: 0x64656570 };
const REACH = DEEP_OUT_FT / CELL_FT; // corners out past which it's all DEEP_FT down
const N = CELL_CORNERS * CELL_CORNERS;

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error("usage: node script/deepen-sea.mjs <world.zip> <out.zip>");
  process.exit(1);
}

// How far down the sea floor is `ft` out from the shore.
function depth(ft) {
  const shelf = SHELF_FT / SLOPE;
  if (ft <= shelf) return ft * SLOPE;
  const t = Math.min(1, (ft - shelf) / (DEEP_OUT_FT - shelf));
  return SHELF_FT + (DEEP_FT - SHELF_FT) * t * t * (3 - 2 * t);
}

const files = new Map(Object.entries(unzipSync(new Uint8Array(fs.readFileSync(from)))).filter(([path]) => !path.endsWith("/")));
const continents = new Set([...files.keys()].map((path) => PLATE_PATH.exec(path)?.[1]).filter(Boolean));
for (const continent of continents) {
  const started = Date.now();
  // Every tile: its plate, and its index there, and its heights.
  const plates = new Map(); // "px,pz" -> plate
  const tiles = []; // { tx, tz, tile }
  const ids = new Map(); // "tx,tz" -> index in tiles
  for (const [path, bytes] of files) {
    const match = PLATE_PATH.exec(path);
    if (match?.[1] !== continent) continue;
    const plate = decodePlate(bytes);
    plates.set(plate.coords.join(","), plate);
    for (const [index, tile] of plate.tiles) {
      const [tx, tz] = [plate.coords[0] * PLATE_TILES + (index % PLATE_TILES), plate.coords[1] * PLATE_TILES + Math.floor(index / PLATE_TILES)];
      ids.set(`${tx},${tz}`, tiles.length);
      tiles.push({ tx, tz, tile });
    }
  }
  const idOf = (tx, tz) => ids.get(`${tx},${tz}`) ?? -1;

  // A corner, by its continent cell position (ci, cj), as one number: its tile's id × N + its
  // index there, in the tile it's the first corner of where there is one, or -1 where there's none.
  const locate = (ci, cj) => {
    const [tx, tz] = [Math.floor(ci / TILE_CELLS), Math.floor(cj / TILE_CELLS)];
    const [i, j] = [ci - tx * TILE_CELLS, cj - tz * TILE_CELLS];
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      if ((a && i) || (b && j)) continue;
      const id = idOf(tx - a, tz - b);
      if (id >= 0) return id * N + (j + b * TILE_CELLS) * CELL_CORNERS + i + a * TILE_CELLS;
    }
    return -1;
  };
  const place = (node) => {
    const { tx, tz } = tiles[Math.floor(node / N)];
    const k = node % N;
    return [tx * TILE_CELLS + (k % CELL_CORNERS), tz * TILE_CELLS + Math.floor(k / CELL_CORNERS)];
  };
  const height = (node) => tiles[Math.floor(node / N)].tile.heights[node % N];

  // The sea's corners: flat ones it reaches from the edges with no tile past them.
  const sea = tiles.map(() => null);
  const isSea = (node) => node >= 0 && sea[Math.floor(node / N)]?.[node % N] === 1;
  const stack = [];
  const reach = (node) => {
    if (node < 0 || isSea(node) || !(height(node) <= FLAT_FT)) return;
    const id = Math.floor(node / N);
    sea[id] ??= new Uint8Array(N);
    sea[id][node % N] = 1;
    stack.push(node);
  };
  tiles.forEach(({ tx, tz }) => {
    for (let n = 0; n <= TILE_CELLS; n++) {
      const [ci, cj] = [tx * TILE_CELLS, tz * TILE_CELLS];
      if (idOf(tx - 1, tz) < 0) reach(locate(ci, cj + n));
      if (idOf(tx + 1, tz) < 0) reach(locate(ci + TILE_CELLS, cj + n));
      if (idOf(tx, tz - 1) < 0) reach(locate(ci + n, cj));
      if (idOf(tx, tz + 1) < 0) reach(locate(ci + n, cj + TILE_CELLS));
    }
  });
  let corners = 0;
  while (stack.length) {
    const [ci, cj] = place(stack.pop());
    corners++;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) reach(locate(ci + di, cj + dj));
  }

  // How far each of the sea's corners is from the nearest that isn't, in corners: each takes the
  // nearest shore its neighbours know of, out to REACH, the nearest first (a queue for each whole
  // number of corners out).
  const far = sea.map((s) => s && new Float32Array(N).fill(Infinity));
  const shore = sea.map((s) => s && new Int32Array(N * 2));
  const queued = sea.map((s) => s && new Int16Array(N).fill(-1)); // the queue each's last in
  let pushes = 0;
  const queues = Array.from({ length: Math.ceil(REACH) + 1 }, () => []);
  let current = 0;
  const NEXT = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const offer = (node, ci, cj, si, sj) => {
    const d = Math.hypot(ci - si, cj - sj);
    const [id, k] = [Math.floor(node / N), node % N];
    if (d > REACH || d >= far[id][k] - 1e-6) return;
    far[id][k] = d;
    shore[id][k * 2] = si;
    shore[id][k * 2 + 1] = sj;
    const q = Math.max(current, Math.floor(d));
    if (queued[id][k] === q) return;
    queued[id][k] = q;
    queues[q].push(node);
    pushes++;
  };
  sea.forEach((s, id) => {
    if (!s) return;
    for (let k = 0; k < N; k++) {
      if (!s[k]) continue;
      const node = id * N + k;
      const [ci, cj] = place(node);
      for (const [di, dj] of NEXT) {
        const next = locate(ci + di, cj + dj);
        if (next >= 0 && !isSea(next)) offer(node, ci, cj, ci + di, cj + dj);
      }
    }
  });
  for (; current < queues.length; current++) {
    const queue = queues[current];
    if (current % 25 === 0) console.log(`  ${current} corners out: ${queue.length} queued, ${pushes} in all`);
    for (let head = 0; head < queue.length; head++) spread(queue[head]);
    queues[current] = null;
  }
  function spread(node) {
    const [id, k] = [Math.floor(node / N), node % N];
    const [si, sj] = [shore[id][k * 2], shore[id][k * 2 + 1]];
    const [ci, cj] = place(node);
    for (const [di, dj] of NEXT) {
      const next = locate(ci + di, cj + dj);
      if (isSea(next)) offer(next, ci + di, cj + dj, si, sj);
    }
  }

  // Each of the sea's corners lowered, then the corners tiles share made the same.
  sea.forEach((s, id) => {
    if (!s) return;
    const { heights } = tiles[id].tile;
    for (let k = 0; k < N; k++) {
      if (!s[k]) continue;
      const [ci, cj] = place(id * N + k);
      const ft = far[id][k] * CELL_FT;
      const uneven = 1 + UNEVEN.share * fbm(ci * CELL_FT, cj * CELL_FT, UNEVEN.seed, UNEVEN);
      heights[k] = Math.min(-1, -depth(ft) * uneven);
    }
  });
  const moved = new Set();
  tiles.forEach(({ tx, tz, tile }, id) => {
    for (let k = 0; k < N; k++) {
      const [i, j] = [k % CELL_CORNERS, Math.floor(k / CELL_CORNERS)];
      if (i < TILE_CELLS && j < TILE_CELLS) continue;
      const node = locate(tx * TILE_CELLS + i, tz * TILE_CELLS + j);
      tile.heights[k] = height(node);
    }
    if (sea[id] || [...tile.heights].some((h, k) => h < 0)) moved.add(id);
  });

  // The sea over them: each cell of the sea's lower than it, then as water.js keeps it and spreads
  // it, with the world's bodies on top.
  const SEA = WATER_TYPES.indexOf("sea");
  for (const id of moved) {
    const { tile } = tiles[id];
    const s = sea[id];
    if (!s) continue;
    tile.water ??= dryWater(TILE_CELLS * TILE_CELLS);
    for (let j = 0; j < TILE_CELLS; j++) {
      for (let i = 0; i < TILE_CELLS; i++) {
        const at = j * CELL_CORNERS + i;
        if (!(s[at] || s[at + 1] || s[at + CELL_CORNERS] || s[at + CELL_CORNERS + 1])) continue;
        tile.water.level[j * TILE_CELLS + i] = 0;
        tile.water.type[j * TILE_CELLS + i] = SEA;
      }
    }
  }
  const water = files.has(waterPath(continent)) ? new WaterMap(JSON.parse(strFromU8(files.get(waterPath(continent)))).bodies) : new WaterMap();
  const changedPlates = new Set([...moved].map((id) => `${Math.floor(tiles[id].tx / PLATE_TILES)},${Math.floor(tiles[id].tz / PLATE_TILES)}`));
  for (const key of changedPlates) {
    const plate = plates.get(key);
    const [px, pz] = plate.coords;
    plate.around = new Uint8Array(AROUND * AROUND);
    for (let b = 0; b < AROUND; b++) for (let a = 0; a < AROUND; a++) plate.around[b * AROUND + a] = idOf(px * PLATE_TILES + a - 1, pz * PLATE_TILES + b - 1) >= 0 ? 1 : 0;
    files.set(platePath(continent, plate.coords), encodePlate(bakeWater(plate, water)));
  }

  // The moved tiles' renditions, their chunk corners' heights, and their plates' made again.
  const changedPlatters = new Map();
  for (const id of moved) {
    const { tx, tz, tile } = tiles[id];
    const key = platterOf(tx, tz).join(",");
    if (!changedPlatters.has(key)) changedPlatters.set(key, decodePlatter(files.get(platterPath(continent, platterOf(tx, tz)))));
    const heights = new Float32Array(CORNERS * CORNERS);
    for (let j = 0; j < CORNERS; j++) for (let i = 0; i < CORNERS; i++) heights[j * CORNERS + i] = tile.heights[j * TILE_CHUNKS * CELL_CORNERS + i * TILE_CHUNKS];
    changedPlatters.get(key).tiles.set(indexIn(tx, tz), { heights, hash: hash64(new Uint8Array(heights.buffer)) });
  }
  for (const platter of changedPlatters.values()) {
    for (let j = 0; j < PLATTER_PLATES; j++) {
      for (let i = 0; i < PLATTER_PLATES; i++) {
        const [px, pz] = [platter.coords[0] * PLATTER_PLATES + i, platter.coords[1] * PLATTER_PLATES + j];
        const rendition = plateRendition((a, b) => platter.tiles.get(indexIn(px * PLATE_TILES + a, pz * PLATE_TILES + b)) ?? null);
        if (rendition) platter.plates.set(plateIndexIn(px, pz), rendition);
      }
    }
    files.set(platterPath(continent, platter.coords), encodePlatter(platter));
  }
  console.log(`${continent}: ${corners} corners of sea floor lowered, in ${moved.size} tiles, ${changedPlates.size} plates and ${changedPlatters.size} platters, in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
fs.writeFileSync(to, zipSync(Object.fromEntries([...files].map(([path, bytes]) => [path, [bytes, { level: 0 }]]))));
console.log(`wrote ${to}`);
