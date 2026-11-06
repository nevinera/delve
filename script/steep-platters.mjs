// Works out how steep each tile's parts are from its plate (v2/rendition.js's steepParts) and
// writes it into the platters, for worlds saved before platters kept it. Leaves everything else as
// it was. /create writes it as it saves a plate, so run this once.
//
//   node script/steep-platters.mjs <world.zip> <out.zip>
//   node script/steep-platters.mjs <world folder>        rewrites a checkout's platters where they are

import fs from "node:fs";
import path from "node:path";
import { unzipSync, zipSync } from "fflate";
import { PLATE_PATH, decodePlate } from "../client/src/v2/plate.js";
import { PLATTER_PATH, decodePlatter, encodePlatter, indexIn, platterOf, platterPath } from "../client/src/v2/platter.js";
import { steepParts } from "../client/src/v2/rendition.js";
import { PLATE_TILES } from "../client/src/v2/sizes.js";
import { loadZipper } from "../client/src/v2/zstd.js";

const [from, to] = process.argv.slice(2);
const folder = from && fs.existsSync(from) && fs.statSync(from).isDirectory();
if (!from || (!folder && !to)) {
  console.error("usage: node script/steep-platters.mjs <world.zip> <out.zip>\n       node script/steep-platters.mjs <world folder>");
  process.exit(1);
}
await loadZipper();

// The world's files, path -> bytes, paths as in the world (a folder's relative to it).
const files = new Map();
if (folder) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== ".git") walk(full);
      else if (entry.isFile()) {
        const relative = path.relative(from, full).split(path.sep).join("/");
        if (PLATE_PATH.test(relative) || PLATTER_PATH.test(relative)) files.set(relative, new Uint8Array(fs.readFileSync(full)));
      }
    }
  };
  walk(from);
} else {
  for (const [name, bytes] of Object.entries(unzipSync(new Uint8Array(fs.readFileSync(from))))) if (!name.endsWith("/")) files.set(name, bytes);
}

const platters = new Map(); // path -> platter
let [tiles, steepTiles] = [0, 0];
for (const [file, bytes] of files) {
  const match = PLATE_PATH.exec(file);
  if (!match) continue;
  const plate = decodePlate(bytes);
  for (const [index, tile] of plate.tiles) {
    const [tx, tz] = [plate.coords[0] * PLATE_TILES + (index % PLATE_TILES), plate.coords[1] * PLATE_TILES + Math.floor(index / PLATE_TILES)];
    const where = platterPath(match[1], platterOf(tx, tz));
    if (!platters.has(where)) {
      if (!files.has(where)) continue;
      platters.set(where, decodePlatter(files.get(where)));
    }
    const rendition = platters.get(where).tiles.get(indexIn(tx, tz));
    if (!rendition) continue;
    rendition.steep = steepParts(tile.heights);
    tiles++;
    if (rendition.steep) steepTiles++;
  }
}
for (const [where, platter] of platters) files.set(where, encodePlatter(platter));
console.log(`${tiles} tiles in ${platters.size} platters, ${steepTiles} with steep ground`);

if (folder) {
  for (const where of platters.keys()) fs.writeFileSync(path.join(from, where), files.get(where));
} else {
  fs.writeFileSync(to, zipSync(Object.fromEntries(files)));
}
