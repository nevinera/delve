// Moves rest points' resting areas out of world.json, where each held its own polygon, into areas
// in each continent's regions.json, the rest point keeping the area's id (v2/regions.js). Leaves
// everything else as it was. /create does the same as it opens a world, so run this once.
//
//   node script/rest-areas.mjs <world.zip> <out.zip>
//   node script/rest-areas.mjs <world folder>        rewrites a checkout's files where they are

import fs from "node:fs";
import path from "node:path";
import { unzipSync, zipSync } from "fflate";
import { moveRestAreas } from "../client/src/v2/regions.js";

const [from, to] = process.argv.slice(2);
const folder = from && fs.existsSync(from) && fs.statSync(from).isDirectory();
if (!from || (!folder && !to)) {
  console.error("usage: node script/rest-areas.mjs <world.zip> <out.zip>\n       node script/rest-areas.mjs <world folder>");
  process.exit(1);
}

// The world's files, path -> bytes: a folder's world.json and regions files, or all of a zip's.
const files = new Map();
if (folder) {
  const read = (relative) => {
    const full = path.join(from, relative);
    if (fs.existsSync(full)) files.set(relative, new Uint8Array(fs.readFileSync(full)));
  };
  read("world.json");
  const continents = path.join(from, "places/continents");
  for (const continent of fs.existsSync(continents) ? fs.readdirSync(continents) : []) read(`places/continents/${continent}/regions.json`);
} else {
  for (const [name, bytes] of Object.entries(unzipSync(new Uint8Array(fs.readFileSync(from))))) if (!name.endsWith("/")) files.set(name, bytes);
}

const before = new Map(files);
console.log(`${moveRestAreas(files)} resting areas moved to regions.json`);

if (folder) {
  for (const [where, bytes] of files) if (before.get(where) !== bytes) fs.writeFileSync(path.join(from, where), bytes);
} else {
  fs.writeFileSync(to, zipSync(Object.fromEntries(files)));
}
