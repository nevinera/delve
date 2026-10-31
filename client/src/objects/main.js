import "../editor/editor.css";
import { strFromU8, strToU8, unzipSync } from "fflate";
import { PLACED_PATH } from "../create/placed.js";
import { keptWorld, readLibrary, writeLibrary } from "../create/store.js";
import { LibrarySync } from "../editor/libraryStore.js";
import { setBuiltObjects } from "../world/objects.js";
import { adoptStrays, builtObjects, images } from "./collections.js";
import { ObjectLibrary } from "./library.js";

// The objects page: the object library of the world /create has open, on its own. Changes go
// straight to the library /create keeps in this browser (create/store.js), which it shares, open
// or not.

const $ = (id) => document.getElementById(id);

function say(message = "", { info = false } = {}) {
  $("message").textContent = message;
  $("message").classList.toggle("info", info);
}

// The JSON files of the world /create has open, path -> bytes, with its changes since it was
// opened: its library, what's placed and world.json. Empty when it has none open.
async function keptFiles() {
  const kept = await keptWorld();
  if (!kept) return new Map();
  let files = Object.entries(unzipSync(kept.bytes, { filter: (file) => file.name.endsWith(".json") }));
  const top = files.some(([path]) => path === "world.json") ? null : files[0]?.[0].split("/")[0];
  if (top) files = files.map(([path, b]) => [path.slice(top.length + 1), b]);
  // A change of null is a file taken away.
  return new Map([...files, ...[...kept.changes].filter(([path]) => path.endsWith(".json"))].filter(([, b]) => b));
}

// The world's files as the library wants them: read and written as JSON.
class World {
  constructor(files) {
    this.files = files;
    this.info = files.has("world.json") ? this.readJson("world.json") : { name: "no world open in /create" };
  }

  readJson(path) {
    return JSON.parse(strFromU8(this.files.get(path)));
  }

  writeJson(path, data) {
    this.files.set(path, strToU8(`${JSON.stringify(data, null, 2)}\n`));
  }
}

// How many objects of the given types (a Set) are placed in the world, in every continent.
async function placedCount(types) {
  let count = 0;
  for (const [path, bytes] of await keptFiles()) {
    if (PLACED_PATH.test(path)) count += (JSON.parse(strFromU8(bytes)).objects ?? []).filter((o) => types.has(o.type)).length;
  }
  return count;
}

const world = new World(await keptFiles());
$("worldName").textContent = world.info.name;
const sync = new LibrarySync(
  world,
  () => {
    setBuiltObjects(builtObjects(world), images(world));
    library.show();
  },
  { read: readLibrary, write: writeLibrary, channel: "delve3d-create-library" },
);
await sync.pull();
// Images kept the old way move to the world's, and structures go (adoptStrays), which the store
// should hear about.
if (adoptStrays(world)) await sync.push();
setBuiltObjects(builtObjects(world), images(world));

const library = new ObjectLibrary($("gallery"), {
  getWorld: () => world,
  onChange: () => sync.push().catch((err) => say(`Couldn't keep the library in this browser: ${err.message}`)),
  placedCount,
  say,
});
library.show();
