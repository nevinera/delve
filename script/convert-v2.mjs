// Makes a version 2 world (client/src/v2/) from a version 1 world's zip, for the /create spike:
// its world.json, and for each continent, platter files with a rendition of each 256 ft tile. A
// v1 tile (512 ft, 8 ft cells) becomes 2×2 v2 tiles. A chunk corner's height is the mean of the
// four v1 cells round it, and a chunk's color the mean of its 4×4 v1 cells' ground colors.
//
//   node script/convert-v2.mjs <v1 world.zip> <v2 world.zip>
import fs from "fs";
import { gunzipSync, unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { unpackPlates } from "../client/src/editor/plates.js";
import { decodeTile } from "../client/src/world/tileCodec.js";
import { groundRgb } from "../client/src/world/tileImage.js";
import { tileAt } from "../client/src/world/paths.js";
import { CORNERS, encodePlatter, indexIn, platterOf, platterPath } from "../client/src/v2/platter.js";
import { CHUNK_FT, TILE_CHUNKS } from "../client/src/v2/sizes.js";

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

// FNV-1a, 64 bits, as 16 hex digits.
function hash64(bytes) {
  let h = 0xcbf29ce484222325n;
  for (const b of bytes) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
  return h.toString(16).padStart(16, "0");
}

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
            heights[j * CORNERS + i] = round.reduce((sum, [tile, at]) => sum + tile.layers.height[at], 0) / round.length;
          }
        }
        const colors = new Uint8Array(TILE_CHUNKS * TILE_CHUNKS * 3);
        for (let j = 0; j < TILE_CHUNKS; j++) {
          for (let i = 0; i < TILE_CHUNKS; i++) {
            const sum = [0, 0, 0];
            for (let dj = 0; dj < perChunk; dj++) {
              for (let di = 0; di < perChunk; di++) {
                const [tile, at] = cell((tx * TILE_CHUNKS + i) * perChunk + di, (tz * TILE_CHUNKS + j) * perChunk + dj);
                groundRgb(tile, at).forEach((v, m) => (sum[m] += v));
              }
            }
            sum.forEach((v, m) => (colors[(j * TILE_CHUNKS + i) * 3 + m] = Math.round(v / perChunk ** 2)));
          }
        }
        highest = Math.max(highest, ...heights);
        const p = platterOf(tx, tz).join(",");
        if (!platters.has(p)) platters.set(p, new Map());
        platters.get(p).set(indexIn(tx, tz), { heights, colors, hash });
      }
    }
  }
  for (const [p, tiles] of platters) {
    const coords = p.split(",").map(Number);
    out[platterPath(key, coords)] = encodePlatter({ coords, tiles });
  }
  console.log(`${key}: ${sources.size} v1 tiles, ${sources.size * 4} v2 tiles in ${platters.size} platters`);
}
if (highest > 8191) console.warn(`the highest ground, ${highest} ft, is over what a platter holds (8,191 ft)`);
fs.writeFileSync(to, zipSync(out));
console.log(`wrote ${to} (${(fs.statSync(to).size / 1e6).toFixed(1)} MB)`);
