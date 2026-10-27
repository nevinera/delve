import "../editor/editor.css";
import { LibrarySync } from "../editor/libraryStore.js";
import { loadLocal } from "../editor/localSave.js";
import { World } from "../editor/world.js";
import { setBuiltObjects } from "../world/objects.js";
import { builtObjects, images } from "./collections.js";
import { ObjectLibrary } from "./library.js";
import { placedCount } from "./placed.js";

// The objects page: the object library of the world kept in this browser, on its own. Changes go
// straight to the browser's library store, which the world editor shares, open or not.

const $ = (id) => document.getElementById(id);

function say(message = "", { info = false } = {}) {
  $("message").textContent = message;
  $("message").classList.toggle("info", info);
}

// The world kept in this browser, from its last keeping: for its name and what's placed in it.
async function keptWorld() {
  const saved = await loadLocal();
  return saved ? World.fromZip(saved.zip) : World.empty();
}

let world = await keptWorld();
$("worldName").textContent = world.info.name;
const sync = new LibrarySync(world, async () => {
  setBuiltObjects(builtObjects(world), images(world));
  library.show();
  $("worldName").textContent = (await keptWorld()).info.name;
});
await sync.pull();
setBuiltObjects(builtObjects(world), images(world));

const library = new ObjectLibrary($("gallery"), {
  getWorld: () => world,
  onChange: () => sync.push().catch((err) => say(`Couldn't keep the library in this browser: ${err.message}`)),
  // From the world's latest keeping, which the world editor makes a moment after each change.
  placedCount: async (types) => placedCount(await keptWorld(), types),
  say,
});
library.show();
