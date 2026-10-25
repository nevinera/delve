// Bakes a zone's tiles from its sketch.
//
// Usage: npm run bake -- <continent>/<zone> [--world core]
//
// Reads public/worlds/<world>/places/continents/<continent>/zones/<zone>.json, writes
// tiles/surface/<x>/<z>.dlt.gz and index.json beside it, removes tiles the zone no longer has,
// and draws an overview to tmp/<zone>.png.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { CELLS } from "../client/src/world/constants.js";
import { TERRAIN, generateTile, prepareZone } from "../client/src/world/generator.js";
import { encodeTile } from "../client/src/world/tileCodec.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const worldIdx = args.indexOf("--world");
const world = worldIdx >= 0 ? args.splice(worldIdx, 2)[1] : "core";
const key = args[0];
if (!key || !/^[\w-]+\/[\w-]+$/.test(key)) {
  console.error("usage: npm run bake -- <continent>/<zone> [--world core]");
  process.exit(1);
}
const [continent, zoneName] = key.split("/");

const continentDir = path.join(root, "public/worlds", world, "places/continents", continent);
const zone = JSON.parse(fs.readFileSync(path.join(continentDir, "zones", `${zoneName}.json`), "utf8"));
const indexPath = path.join(continentDir, "index.json");
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf8")) : { version: 1, tiles: {} };

const started = Date.now();
const ctx = prepareZone(zone, key);
const tiles = new Map();
let bytes = 0;
for (const [tx, tz] of ctx.tiles) {
  const tile = generateTile(ctx, tx, tz);
  const gz = gzip(encodeTile(tile));
  const file = tilePath(tx, tz);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, gz);
  tiles.set(`${tx},${tz}`, tile);
  bytes += gz.length;
}

// Tiles this zone used to own but no longer does.
for (const [coords, entry] of Object.entries(index.tiles)) {
  if (entry.zone !== zoneName || tiles.has(coords)) continue;
  const [tx, tz] = coords.split(",").map(Number);
  fs.rmSync(tilePath(tx, tz), { force: true });
  delete index.tiles[coords];
}
for (const coords of tiles.keys()) {
  const owner = index.tiles[coords]?.zone;
  if (owner && owner !== zoneName) console.warn(`warning: tile ${coords} was owned by ${owner}`);
  index.tiles[coords] = { zone: zoneName, layers: ["surface"] };
}
index.tiles = Object.fromEntries(Object.entries(index.tiles).sort(([a], [b]) => compareCoords(a, b)));
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

const overview = path.join(root, "tmp", `${zoneName}.png`);
fs.mkdirSync(path.dirname(overview), { recursive: true });
fs.writeFileSync(overview, drawOverview(tiles));

const kb = (bytes / 1024).toFixed(0);
console.log(`baked ${tiles.size} tiles (${kb}KB gzipped) in ${Date.now() - started}ms`);
console.log(`overview: ${path.relative(root, overview)}`);

function tilePath(tx, tz) {
  return path.join(continentDir, "tiles/surface", String(tx), `${tz}.dlt.gz`);
}

function compareCoords(a, b) {
  const [ax, az] = a.split(",").map(Number);
  const [bx, bz] = b.split(",").map(Number);
  return ax - bx || az - bz;
}

// gzip records the OS that wrote it; pin it so bakes on different machines are byte-identical.
function gzip(data) {
  const out = zlib.gzipSync(data, { level: 9 });
  out[9] = 255;
  return out;
}

// --- overview: one pixel per cell, hill-shaded, colored by terrain ---

function drawOverview(tiles) {
  const coords = [...tiles.values()].map((t) => t.coords);
  const minX = Math.min(...coords.map((c) => c[0]));
  const minZ = Math.min(...coords.map((c) => c[1]));
  const width = (Math.max(...coords.map((c) => c[0])) - minX + 1) * CELLS;
  const height = (Math.max(...coords.map((c) => c[1])) - minZ + 1) * CELLS;
  const rgb = Buffer.alloc(width * height * 3, 24);

  const colors = {
    grass: [96, 140, 70],
    dirt: [140, 112, 80],
    sand: [210, 196, 150],
    rock: [130, 126, 120],
    path: [176, 150, 110],
    shore: [150, 150, 110],
    mud: [100, 88, 70],
  };
  const forest = [40, 80, 40];

  for (const tile of tiles.values()) {
    const { height: h, water, terrain, forest: trees } = tile.layers;
    const at = (i, j) => h[Math.max(0, Math.min(CELLS - 1, j)) * CELLS + Math.max(0, Math.min(CELLS - 1, i))];
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const k = j * CELLS + i;
        // Light from the north-west, exaggerated so gentle coastal slopes still show.
        const dx = (at(i + 1, j) - at(i - 1, j)) / 16;
        const dz = (at(i, j + 1) - at(i, j - 1)) / 16;
        const shade = Math.max(0.55, Math.min(1.35, 1 - (dx + dz) * 2.5));
        let c = colors[TERRAIN[terrain[k]]];
        const f = trees[k] / 255;
        c = c.map((v, n) => v + (forest[n] - v) * f * 0.8);
        if (!Number.isNaN(water[k])) {
          const depth = Math.min(1, (water[k] - h[k]) / 20);
          c = [60 - depth * 30, 110 - depth * 40, 170 - depth * 30];
        }
        const px = (tile.coords[0] - minX) * CELLS + i;
        const pz = (tile.coords[1] - minZ) * CELLS + j;
        const o = (pz * width + px) * 3;
        for (let n = 0; n < 3; n++) rgb[o + n] = Math.max(0, Math.min(255, Math.round(c[n] * shade)));
      }
    }
  }
  return encodePng(width, height, rgb);
}

function encodePng(width, height, rgb) {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) rgb.copy(rows, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
