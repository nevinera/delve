import "./library.css";
import { strFromU8 } from "fflate";
import { PLACED_PATH } from "../create/placed.js";
import { keptSource, onSourceSaved, saveKept } from "../create/keptSave.js";
import { BranchMoved } from "../create/repo.js";
import { KeptJson, keptFiles } from "../create/keptWorld.js";
import { readLibrary, writeLibrary } from "../create/store.js";
import { GithubAuthError } from "../github/github.js";
import { LibrarySync, isLibraryPath } from "./libraryStore.js";
import { isClassPath } from "../world/paths.js";
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

// How many objects of the given types (a Set) are placed in the world, in every continent.
async function placedCount(types) {
  let count = 0;
  for (const [path, bytes] of await keptFiles()) {
    if (PLACED_PATH.test(path)) count += (JSON.parse(strFromU8(bytes)).objects ?? []).filter((o) => types.has(o.type)).length;
  }
  return count;
}

const world = new KeptJson(await keptFiles());
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

// Saving the library to GitHub, as one commit of its files alone, on the repo /create opened the
// world from. /create's other changes stay unsaved until it saves them.
const showSource = (source) => {
  $("repoSave").disabled = !source?.commitSha;
  $("repoSave").title = source?.commitSha ? `commit this library to ${source.repo}` : "open the world from GitHub in /create, and save it there first";
};
showSource(await keptSource());
onSourceSaved(showSource);
$("repoSave").addEventListener("click", async () => {
  const button = $("repoSave");
  button.disabled = true;
  try {
    await sync.push();
    const message = $("repoMessage").value.trim() || "Save the object library";
    const next = await saveKept(world.files, (path) => isLibraryPath(path) && !isClassPath(path), { message, log: (text) => say(text, { info: true }) });
    if (!next) return say("Nothing's changed since the last save.", { info: true });
    $("repoMessage").value = "";
    say(`Saved ${next.commitSha.slice(0, 7)}.`, { info: true });
  } catch (e) {
    console.error("couldn't save the library", e);
    if (e instanceof BranchMoved) say(`${e.message}: open the repo again in /create, then save.`);
    else if (e instanceof GithubAuthError) say("Connect GitHub first, from your worlds page.");
    else say(`Couldn't save: ${e.message}`);
  } finally {
    showSource(await keptSource());
  }
});
