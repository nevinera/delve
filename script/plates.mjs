// Moves a world on disk to plates (client/src/editor/plates.js, plans/plates.md): its tiles, one
// .dlt.gz file each under places/continents/*/tiles/, become .plate files under plates/, with a
// plates.json index for each continent, and the tile files go. A world already in plates has its
// plates and indexes made again from its tiles, if it has any.
//
//   node script/plates.mjs <world directory>
import fs from "fs";
import path from "path";
import { packPlates } from "../client/src/editor/plates.js";

const root = process.argv[2];
if (!root || !fs.existsSync(path.join(root, "places"))) {
  console.error("usage: node script/plates.mjs <world directory>");
  process.exit(1);
}

const tiles = new Map();
for (const file of fs.readdirSync(path.join(root, "places"), { recursive: true })) {
  const rel = path.join("places", file).split(path.sep).join("/");
  if (/\/tiles\/[\w-]+\/-?\d+\/-?\d+\.dlt\.gz$/.test(rel)) tiles.set(rel, new Uint8Array(fs.readFileSync(path.join(root, rel))));
}
if (!tiles.size) {
  console.log("no tile files to move");
  process.exit(0);
}

const started = Date.now();
const stored = await packPlates(tiles, { onProgress: ({ done, total }) => process.stdout.write(`\r${done} of ${total} plates`) });
process.stdout.write("\n");
for (const [rel, bytes] of stored) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), bytes);
}
const continents = new Set([...tiles.keys()].map((rel) => rel.split("/")[2]));
for (const continent of continents) fs.rmSync(path.join(root, "places/continents", continent, "tiles"), { recursive: true, force: true });
const size = [...stored.values()].reduce((sum, bytes) => sum + bytes.length, 0);
console.log(`${tiles.size} tiles into ${stored.size - continents.size} plates, ${(size / 1e6).toFixed(1)} MB, in ${((Date.now() - started) / 1000).toFixed(1)}s`);
