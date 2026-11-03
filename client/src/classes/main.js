import "../objects/library.css";
import "./classes.css";
import { playSound } from "../abilities/sounds.js";
import { keptSource, onSourceSaved, saveKept } from "../create/keptSave.js";
import { KeptJson, keptFiles } from "../create/keptWorld.js";
import { BranchMoved } from "../create/repo.js";
import { readLibrary, writeLibrary } from "../create/store.js";
import { GithubAuthError } from "../github/github.js";
import { LibrarySync } from "../objects/libraryStore.js";
import { isClassPath } from "../world/paths.js";
import { classPath, classProblems, classesOf, newAbility, newClass, newStatus } from "./classFile.js";
import { abilityFields, classFields, statusFields } from "./fields.js";
import { renderFields } from "./form.js";
import { AbilityPreview } from "./preview.js";

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
let part = null; // what of it: { kind: "ability" or "status", id }, or null for the class itself

const sync = new LibrarySync(world, () => show(), { read: readLibrary, write: writeLibrary, channel: "delve3d-create-library" });
await sync.pull();
const keep = () => sync.push().catch((err) => say(`Couldn't keep this in the browser: ${err.message}`));

const change = (made) => {
  world.writeJson(classPath(made.id), made);
  keep();
};

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// A button in the side list.
function listButton(text, active, click) {
  const button = el("button", { type: "button", textContent: text || "(no name)" });
  button.classList.toggle("active", active);
  button.addEventListener("click", click);
  return button;
}

const pick = (id, what = null) => {
  picked = id;
  part = what;
  show();
};

function showList(classes) {
  $("classList").replaceChildren(...classes.map((c) => listButton(c.name, c.id === picked, () => pick(c.id))));
}

// The picked class's own list: the class, its abilities by level, and its statuses.
function showParts(made) {
  const parts = $("classParts");
  parts.replaceChildren();
  if (!made) return;
  const isPart = (kind, id) => part?.kind === kind && part.id === id;
  const heading = (text, click) => {
    const add = el("button", { type: "button", textContent: "add", className: "classes-add" });
    add.addEventListener("click", click);
    return el("div", { className: "classes-heading" }, el("span", { textContent: text }), add);
  };
  const abilities = [...(made.abilities ?? [])].sort((a, b) => (a.level ?? 1) - (b.level ?? 1) || a.name.localeCompare(b.name));
  parts.append(
    el("div", { className: "classes-list" }, listButton("class", !part, () => pick(made.id))),
    heading("abilities", () => {
      const ability = newAbility();
      made.abilities = [...(made.abilities ?? []), ability];
      change(made);
      pick(made.id, { kind: "ability", id: ability.id });
      $("config").querySelector("input")?.select();
    }),
    el("div", { className: "classes-list" }, ...abilities.map((a) => listButton(`${a.level ?? 1} ${a.name}`, isPart("ability", a.id), () => pick(made.id, { kind: "ability", id: a.id })))),
    heading("statuses", () => {
      const status = newStatus();
      made.statuses = [...(made.statuses ?? []), status];
      change(made);
      pick(made.id, { kind: "status", id: status.id });
      $("config").querySelector("input")?.select();
    }),
    el("div", { className: "classes-list" }, ...(made.statuses ?? []).map((s) => listButton(s.name, isPart("status", s.id), () => pick(made.id, { kind: "status", id: s.id })))),
  );
}

// The form for the picked class, ability or status, with what's wrong with the class over it.
function showConfig(made) {
  const config = $("config");
  config.replaceChildren();
  if (!made) {
    config.textContent = open ? "Pick a class, or make a new one." : "Open a world in /create first.";
    return;
  }
  const list = part?.kind === "ability" ? "abilities" : part?.kind === "status" ? "statuses" : null;
  const thing = list ? made[list]?.find((t) => t.id === part.id) : made;
  if (!thing) return pick(made.id);
  const fields = part?.kind === "ability" ? abilityFields(made) : part?.kind === "status" ? statusFields(made) : classFields(made);
  const problems = el("ul", { className: "classes-problems" });
  const showProblems = () => problems.replaceChildren(...classProblems(made).map((p) => el("li", { textContent: p })));
  showProblems();
  const changed = () => {
    change(made);
    showProblems();
    showList(classesOf(world));
    showParts(made);
    showPreview(made, part?.kind === "ability" ? thing : null);
  };
  const reshaped = () => {
    changed();
    const top = config.scrollTop;
    showConfig(made);
    config.scrollTop = top;
  };
  const remove = el("button", { type: "button", textContent: `delete ${part?.kind ?? "class"}`, className: "form-remove" });
  remove.addEventListener("click", () => {
    if (!window.confirm(`Delete ${thing.name || `this ${part?.kind ?? "class"}`}?`)) return;
    if (list) {
      made[list] = made[list].filter((t) => t !== thing);
      if (!made[list].length) delete made[list];
      change(made);
      pick(made.id);
    } else {
      world.files.delete(classPath(made.id));
      keep();
      pick(null);
    }
  });
  config.append(problems, ...renderFields(fields, thing, { changed, reshaped }), remove);
}

// The preview's made the first time an ability's picked, since the page needs it only then.
let preview = null;
function showPreview(made, ability) {
  $("preview").hidden = !ability;
  if (!ability) return preview?.setAbility(null);
  preview ??= new AbilityPreview($("preview"));
  window.classes = { preview, playSound };
  preview.setClass(made);
  // Changing a field needn't restart what's playing, or move the camera off where it's been put.
  const key = JSON.stringify(ability);
  if (key !== shownAbility) preview.setAbility(ability, made.statuses ?? []);
  shownAbility = key;
}
let shownAbility = null;


function show() {
  const classes = classesOf(world);
  if (!classes.some((c) => c.id === picked)) picked = null;
  const made = classes.find((c) => c.id === picked);
  showList(classes);
  showParts(made);
  showConfig(made);
  showPreview(made, part?.kind === "ability" ? made.abilities?.find((a) => a.id === part.id) : null);
}

$("newClass").disabled = !open;
$("newClass").addEventListener("click", () => {
  const made = newClass();
  change(made);
  pick(made.id);
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
