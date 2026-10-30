// Makes a version 2 world (client/src/v2/) from a version 1 world's zip, for the /create spike:
// its world.json, and for each continent, platter files with a rendition of each 256 ft tile and
// each plate (v2/rendition.js), and plate files with the ground at cell scale (v2/plate.js), which
// is each chunk's rendition: cell corners' heights smoothly between v1 cells, and each cell the
// color of the v1 cell it's in. A v1 tile (512 ft, 8 ft cells) becomes 2×2 v2 tiles. Renditions
// show the surface you'd see: the water's where there's water, else the ground's. A chunk
// corner's height is the mean of the four v1 cells' round it, and a chunk's color the mean of its
// 4×4 v1 cells', water drawn WATER_RGB.
//
//   node script/convert-v2.mjs <v1 world.zip> <v2 world.zip>
import fs from "fs";
import { gunzipSync, unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { unpackPlates } from "../client/src/editor/plates.js";
import { decodeTile } from "../client/src/world/tileCodec.js";
import { groundRgb } from "../client/src/world/tileImage.js";
import { tileAt } from "../client/src/world/paths.js";
import { CORNERS, encodePlatter, indexIn, plateIndexIn, platterOf, platterPath } from "../client/src/v2/platter.js";
import { CELL_CORNERS, TILE_CELLS, encodePlate, platePath, tileIndexInPlate } from "../client/src/v2/plate.js";
import { hash64, plateRendition } from "../client/src/v2/rendition.js";
import { CELL_FT, CHUNK_FT, PLATE_TILES, PLATTER_PLATES, TILE_CHUNKS } from "../client/src/v2/sizes.js";

const WATER_RGB = [46, 96, 140];

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error("usage: node script/convert-v2.mjs <v1 world.zip> <v2 world.zip>");
  process.exit(1);
}

// The world's files, without the one top folder GitHub's zips have.
let files = new Map(Object.entries(unzipSync(new Uint8Array(fs.readFileSync(from)))).filter(([path]) => !path.endsWith("/")));
if (!files.has("world.json")) {
  const top = [...files.keys()][0].split("/")[0];
  files = new Map([...files].map(([path, bytes]) => [path.slice(top.length + 1), bytes]));
}
files = await unpackPlates(files);
const info = JSON.parse(strFromU8(files.get("world.json")));

const out = { "world.json": strToU8(`${JSON.stringify({ ...info, version: 2 }, null, 2)}\n`) };
let highest = -Infinity;
for (const { key } of info.continents) {
  const sources = new Map(); // "tx,tz" -> v1 tile file bytes
  for (const [path, bytes] of files) {
    const at = tileAt(path);
    if (at?.continent === key && at.layer === "surface") sources.set(`${at.tx},${at.tz}`, bytes);
  }
  const decoded = new Map();
  const v1 = (tx, tz) => {
    const k = `${tx},${tz}`;
    if (!decoded.has(k)) {
      const bytes = sources.get(k);
      decoded.set(k, bytes ? decodeTile(bytes[0] === 0x1f ? gunzipSync(bytes) : bytes) : null);
    }
    return decoded.get(k);
  };
  const any = v1(...[...sources.keys()][0].split(",").map(Number));
  const [n, cellFt] = [any.cells, any.cellFt];
  // A v1 cell by its continent cell position, as [tile, index], or null.
  const cell = (ci, cj) => {
    const tile = v1(Math.floor(ci / n), Math.floor(cj / n));
    return tile && [tile, (cj - tile.coords[1] * n) * n + (ci - tile.coords[0] * n)];
  };
  const perChunk = CHUNK_FT / cellFt;
  const wet = (tile, at) => tile.layers.water[at] > tile.layers.height[at];
  const surface = (tile, at) => (wet(tile, at) ? tile.layers.water[at] : tile.layers.height[at]);
  const colorOf = (tile, at) => (wet(tile, at) ? WATER_RGB : groundRgb(tile, at));
  // The surface's height at continent feet (x, z), straight between v1 cells' middles.
  const surfaceAt = (x, z) => {
    const [u, v] = [x / cellFt - 0.5, z / cellFt - 0.5];
    const [i, j] = [Math.floor(u), Math.floor(v)];
    const [fu, fv] = [u - i, v - j];
    let [sum, weight] = [0, 0];
    for (const [di, dj, w] of [[0, 0, (1 - fu) * (1 - fv)], [1, 0, fu * (1 - fv)], [0, 1, (1 - fu) * fv], [1, 1, fu * fv]]) {
      const found = cell(i + di, j + dj);
      if (!found) continue;
      sum += surface(...found) * w;
      weight += w;
    }
    return weight ? sum / weight : surface(...cell(Math.floor(x / cellFt), Math.floor(z / cellFt)));
  };
  const plates = new Map(); // "px,pz" -> tiles' ground at cell scale
  // One terrain palette for every plate, for the spike.
  const palette = [];
  const terrainIndex = (name) => {
    if (!palette.includes(name)) palette.push(name);
    return palette.indexOf(name);
  };

  const platters = new Map(); // "px,pz" -> tiles
  for (const [k, bytes] of sources) {
    const [otx, otz] = k.split(",").map(Number);
    const hash = hash64(bytes);
    for (let b = 0; b < 2; b++) {
      for (let a = 0; a < 2; a++) {
        const [tx, tz] = [otx * 2 + a, otz * 2 + b];
        const heights = new Float32Array(CORNERS * CORNERS);
        for (let j = 0; j < CORNERS; j++) {
          for (let i = 0; i < CORNERS; i++) {
            // The v1 cells whose corners meet at this chunk corner.
            const [ci, cj] = [((tx * TILE_CHUNKS + i) * CHUNK_FT) / cellFt, ((tz * TILE_CHUNKS + j) * CHUNK_FT) / cellFt];
            const round = [cell(ci - 1, cj - 1), cell(ci, cj - 1), cell(ci - 1, cj), cell(ci, cj)].filter(Boolean);
            heights[j * CORNERS + i] = round.reduce((sum, [tile, at]) => sum + surface(tile, at), 0) / round.length;
          }
        }
        const colors = new Uint8Array(TILE_CHUNKS * TILE_CHUNKS * 3);
        for (let j = 0; j < TILE_CHUNKS; j++) {
          for (let i = 0; i < TILE_CHUNKS; i++) {
            const sum = [0, 0, 0];
            for (let dj = 0; dj < perChunk; dj++) {
              for (let di = 0; di < perChunk; di++) {
                const [tile, at] = cell((tx * TILE_CHUNKS + i) * perChunk + di, (tz * TILE_CHUNKS + j) * perChunk + dj);
                colorOf(tile, at).forEach((v, m) => (sum[m] += v));
              }
            }
            sum.forEach((v, m) => (colors[(j * TILE_CHUNKS + i) * 3 + m] = Math.round(v / perChunk ** 2)));
          }
        }
        const cellHeights = new Float32Array(CELL_CORNERS * CELL_CORNERS);
        for (let j = 0; j < CELL_CORNERS; j++) for (let i = 0; i < CELL_CORNERS; i++) cellHeights[j * CELL_CORNERS + i] = surfaceAt((tx * TILE_CELLS + i) * CELL_FT, (tz * TILE_CELLS + j) * CELL_FT);
        const cellColors = new Uint8Array(TILE_CELLS * TILE_CELLS * 3);
        const cellTerrain = new Uint8Array(TILE_CELLS * TILE_CELLS);
        const cellForest = new Uint8Array(TILE_CELLS * TILE_CELLS);
        for (let j = 0; j < TILE_CELLS; j++) {
          for (let i = 0; i < TILE_CELLS; i++) {
            const [tile, at] = cell(Math.floor(((tx * TILE_CELLS + i + 0.5) * CELL_FT) / cellFt), Math.floor(((tz * TILE_CELLS + j + 0.5) * CELL_FT) / cellFt));
            cellColors.set(colorOf(tile, at), (j * TILE_CELLS + i) * 3);
            cellTerrain[j * TILE_CELLS + i] = terrainIndex(tile.palettes.terrain[tile.layers.terrain[at]]);
            cellForest[j * TILE_CELLS + i] = tile.layers.forest[at];
          }
        }
        const plateKey = [Math.floor(tx / PLATE_TILES), Math.floor(tz / PLATE_TILES)].join(",");
        if (!plates.has(plateKey)) plates.set(plateKey, new Map());
        plates.get(plateKey).set(tileIndexInPlate(tx, tz), { heights: cellHeights, colors: cellColors, terrain: cellTerrain, forest: cellForest });
        highest = Math.max(highest, ...heights);
        const p = platterOf(tx, tz).join(",");
        if (!platters.has(p)) platters.set(p, new Map());
        platters.get(p).set(indexIn(tx, tz), { heights, colors, hash });
      }
    }
  }
  let plateBytes = 0;
  for (const [p, tiles] of plates) {
    const coords = p.split(",").map(Number);
    out[platePath(key, coords)] = encodePlate({ coords, palette, tiles });
    plateBytes += out[platePath(key, coords)].length;
  }
  let plateCount = 0;
  for (const [p, tiles] of platters) {
    const coords = p.split(",").map(Number);
    const plates = new Map();
    for (let j = 0; j < PLATTER_PLATES; j++) {
      for (let i = 0; i < PLATTER_PLATES; i++) {
        const [px, pz] = [coords[0] * PLATTER_PLATES + i, coords[1] * PLATTER_PLATES + j];
        const plate = plateRendition((a, b) => tiles.get(indexIn(px * PLATE_TILES + a, pz * PLATE_TILES + b)) ?? null);
        if (plate) plates.set(plateIndexIn(px, pz), plate);
      }
    }
    plateCount += plates.size;
    out[platterPath(key, coords)] = encodePlatter({ coords, tiles, plates });
  }
  console.log(`${key}: ${sources.size} v1 tiles, ${sources.size * 4} v2 tiles in ${plateCount} plates and ${platters.size} platters`);
  console.log(`plate files: ${(plateBytes / 1e6).toFixed(1)} MB, ${((plateBytes / sources.size / 4) / 1e3).toFixed(1)} KB a tile`);
}
if (highest > 8191) console.warn(`the highest ground, ${highest} ft, is over what a platter holds (8,191 ft)`);
fs.writeFileSync(to, zipSync(out));
console.log(`wrote ${to} (${(fs.statSync(to).size / 1e6).toFixed(1)} MB)`);
