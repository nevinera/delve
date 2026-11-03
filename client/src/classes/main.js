import "../objects/library.css";
import "./classes.css";
import { keptSource, onSourceSaved, saveKept } from "../create/keptSave.js";
import { KeptJson, keptFiles } from "../create/keptWorld.js";
import { BranchMoved } from "../create/repo.js";
import { readLibrary, writeLibrary } from "../create/store.js";
import { GithubAuthError } from "../github/github.js";
import { LibrarySync } from "../objects/libraryStore.js";
import { isClassPath } from "../world/paths.js";
import { classPath, classesOf, newClass } from "./classFile.js";

// The class editor: the classes of the world /create has open. Changes go to the store /create
// shares with the objects page, and the page's button commits them to the world's repo.

const $ = (id) => document.getElementById(id);

function say(message = "", { info = false } = {}) {
  $("message").textContent = message;
  $("message").classList.toggle("info", info);
}

const world = new KeptJson(await keptFiles());
$("worldName").textContent = world.info.name;
const open = world.files.has("world.json");
let picked = null; // the id of the class being edited

const sync = new LibrarySync(world, () => show(), { read: readLibrary, write: writeLibrary, channel: "delve3d-create-library" });
await sync.pull();
const keep = () => sync.push().catch((err) => say(`Couldn't keep this in the browser: ${err.message}`));

const change = (made) => {
  world.writeJson(classPath(made.id), made);
  keep();
};

function showList(classes) {
  $("classList").replaceChildren(
    ...classes.map((c) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = c.name || "(no name)";
      button.classList.toggle("active", c.id === picked);
      button.addEventListener("click", () => {
        picked = c.id;
        show();
      });
      return button;
    }),
  );
}

function showClass(made) {
  const config = $("config");
  config.replaceChildren();
  if (!made) {
    config.textContent = open ? "Pick a class, or make a new one." : "Open a world in /create first.";
    return;
  }
  const label = document.createElement("label");
  label.textContent = "name";
  const name = document.createElement("input");
  name.value = made.name;
  name.addEventListener("input", () => {
    made.name = name.value;
    change(made);
    showList(classesOf(world));
  });
  label.append(name);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "delete class";
  remove.addEventListener("click", () => {
    if (!window.confirm(`Delete ${made.name || "this class"}?`)) return;
    world.files.delete(classPath(made.id));
    keep();
    picked = null;
    show();
  });
  config.append(label, remove);
}

function show() {
  const classes = classesOf(world);
  if (!classes.some((c) => c.id === picked)) picked = null;
  showList(classes);
  showClass(classes.find((c) => c.id === picked));
}

$("newClass").disabled = !open;
$("newClass").addEventListener("click", () => {
  const made = newClass();
  picked = made.id;
  change(made);
  show();
  $("config").querySelector("input")?.select();
});
show();

// Saving the classes to GitHub, as one commit of their files alone.
const showSource = (source) => {
  $("repoSave").disabled = !source?.commitSha;
  $("repoSave").title = source?.commitSha ? `commit these classes to ${source.repo}` : "open the world from GitHub in /create, and save it there first";
};
showSource(await keptSource());
onSourceSaved(showSource);
$("repoSave").addEventListener("click", async () => {
  $("repoSave").disabled = true;
  try {
    await sync.push();
    const message = $("repoMessage").value.trim() || "Save the classes";
    const next = await saveKept(world.files, isClassPath, { message, log: (text) => say(text, { info: true }) });
    if (!next) return say("Nothing's changed since the last save.", { info: true });
    $("repoMessage").value = "";
    say(`Saved ${next.commitSha.slice(0, 7)}.`, { info: true });
  } catch (e) {
    console.error("couldn't save the classes", e);
    if (e instanceof BranchMoved) say(`${e.message}: open the repo again in /create, then save.`);
    else if (e instanceof GithubAuthError) say("Connect GitHub first, from your worlds page.");
    else say(`Couldn't save: ${e.message}`);
  } finally {
    showSource(await keptSource());
  }
});
