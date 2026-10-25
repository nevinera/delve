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
import { generateTile, prepareZone } from "../client/src/world/generator.js";
import { encodeTile } from "../client/src/world/tileCodec.js";
import { tileRgba } from "../client/src/world/tileImage.js";

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

  for (const tile of tiles.values()) {
    const rgba = tileRgba(tile);
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const px = (tile.coords[0] - minX) * CELLS + i;
        const pz = (tile.coords[1] - minZ) * CELLS + j;
        const o = (pz * width + px) * 3;
        const k = (j * CELLS + i) * 4;
        rgb[o] = rgba[k];
        rgb[o + 1] = rgba[k + 1];
        rgb[o + 2] = rgba[k + 2];
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
