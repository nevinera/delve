import "../objects/library.css";
import "./classes.css";
import { keptSource, onSourceSaved, saveKept } from "../create/keptSave.js";
import { KeptJson, keptFiles } from "../create/keptWorld.js";
import { BranchMoved } from "../create/repo.js";
import { openFromAddress, worldBar } from "../create/worldBar.js";
import { readLibrary, writeLibrary } from "../create/store.js";
import { GithubAuthError } from "../github/github.js";
import { LibrarySync } from "../objects/libraryStore.js";
import { setWorldIcons } from "../play/icons.js";
import { setWorldEffectSheets } from "../abilities/effectTextures.js";
import { isClassPath } from "../world/paths.js";
import { spellbookBoard, statusBoard, talentBoard } from "./boards.js";
import { classPath, classProblems, classesOf, newClass } from "./classFile.js";
import { abilityBuilder } from "./abilityBuilder.js";
import { classBuilder, talentBuilder } from "./classBuilder.js";
import { classFields } from "./fields.js";
import { renderFields } from "./form.js";
import { statusBuilder } from "./statusBuilder.js";
import { statusSummary } from "./statusChoices.js";
import { AbilityPreview } from "./preview.js";
import { GENERAL, addAbility, addPassive, addStatus, addTalent, bookPages, duplicateAbility, removeAbility, removePassive, removeStatus, removeTalent, roomForPassive, toggleOnSpec, usedBy } from "./spellbook.js";
import { showMenu } from "./tileMenu.js";

// The class editor: the classes of the world this browser keeps, opened here or in /create. Changes go to the store /create
// shares with the objects page, and the page's button commits them to the world's repo.

const $ = (id) => document.getElementById(id);

function say(message = "", { info = false } = {}) {
  $("message").textContent = message;
  $("message").classList.toggle("info", info);
}

await openFromAddress(say);
const world = new KeptJson(await keptFiles());
setWorldIcons(world.files);
setWorldEffectSheets(world.files);
$("worldName").textContent = world.info.name;
const open = world.files.has("world.json");
let picked = null; // the id of the class being edited
let tab = "class"; // which tab: class, book, talents or statuses
let page = GENERAL; // which page of the spellbook
let part = null; // what's being edited on it: { kind: "ability", id }, { kind: "passive", index }, { kind: "specPassive", spec } or { kind: "talent", level, id }
const statusFilter = { text: "" };

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

const pick = (id) => {
  picked = id;
  part = null;
  page = GENERAL;
  show();
};

function showClassPicker(classes) {
  const select = $("classPick");
  select.replaceChildren(
    ...(picked ? [] : [el("option", { value: "", textContent: classes.length ? "pick a class" : "no classes yet" })]),
    ...classes.map((c) => el("option", { value: c.id, textContent: c.name || "(no name)" })),
  );
  select.value = picked ?? "";
  select.disabled = !classes.length;
}

function showTabs(made) {
  $("classTabs").hidden = !made;
  for (const button of $("classTabs").querySelectorAll("button")) {
    const on = button.dataset.tab === tab;
    button.classList.toggle("active", on);
    button.setAttribute("aria-selected", on);
  }
}

function showProblems(made) {
  const problems = made ? classProblems(made) : [];
  $("problemList").replaceChildren(...problems.map((p) => el("li", { textContent: p })));
  $("problemCount").textContent = `${problems.length} ${problems.length === 1 ? "problem" : "problems"} with this class`;
  $("problems").hidden = !problems.length;
}

const statusOf = (made, id) => made.statuses?.find((s) => s.id === id);

// The hooks that let a form's status fields open the pop-up.
const statusHooks = (made) => ({
  edit: (id) => openStatus(made, id),
  create: (done) => {
    const status = addStatus(made);
    change(made);
    done(status.id);
    openStatus(made, status.id);
    $("statusDialog").querySelector("input")?.select();
  },
});

// The status pop-up, over whatever's being edited. Opening a status from inside one goes on top of it,
// and "back" returns to the one under.
let statusStack = [];

function openStatus(made, id) {
  statusStack.push(id);
  drawStatus(made);
  if (!$("statusDialog").open) $("statusDialog").showModal();
}

function drawStatus(made) {
  const dialog = $("statusDialog");
  const status = statusOf(made, statusStack.at(-1));
  if (!status) return dialog.close();
  const back = el("button", { type: "button", textContent: statusStack.length > 1 ? "back" : "done" });
  back.addEventListener("click", () => {
    statusStack.pop();
    if (statusStack.length) drawStatus(made);
    else dialog.close();
  });
  const changed = () => {
    change(made);
    showProblems(made);
    title.textContent = status.name || "(no name)";
  };
  const reshaped = () => {
    changed();
    const top = body.scrollTop;
    drawStatus(made);
    dialog.querySelector(".status-dialog-body").scrollTop = top;
  };
  const title = el("h3", { textContent: status.name || "(no name)" });
  const uses = usedBy(made, status.id);
  const remove = el("button", { type: "button", textContent: "delete status", className: "form-remove" });
  remove.addEventListener("click", () => {
    if (remove.dataset.sure) {
      removeStatus(made, status.id);
      change(made);
      statusStack = statusStack.filter((id) => id !== status.id);
      if (statusStack.length) drawStatus(made);
      else dialog.close();
      return;
    }
    remove.dataset.sure = "yes";
    remove.textContent = uses.length ? `yes, delete it (${uses.length} still use it)` : "yes, delete it";
  });
  const body = el("div", { className: "status-dialog-body" }, el("p", { className: "status-uses", textContent: uses.length ? `Used by ${uses.join(", ")}.` : "Nothing uses this yet." }), ...statusBuilder(made, status, { changed, reshaped, status: statusHooks(made) }));
  dialog.replaceChildren(el("div", { className: "status-dialog-head" }, title, el("span", { className: "library-spacer" }), remove, back), body);
}

$("statusDialog").addEventListener("close", () => {
  statusStack = [];
  show();
});

const openAbility = (id) => {
  part = { kind: "ability", id };
  show();
  $("config").querySelector("input")?.select();
};

const addOnPage = (made, level, what) => {
  if (what === "ability") {
    const ability = addAbility(made, page, level);
    change(made);
    return openAbility(ability.id);
  }
  const status = addPassive(made, page, level);
  change(made);
  part = page === GENERAL ? { kind: "passive", index: made.passives.length - 1 } : { kind: "specPassive", spec: page };
  show();
  openStatus(made, status.id);
  $("statusDialog").querySelector("input")?.select();
};

function addItems(made, level) {
  return [
    { label: `add an ability at level ${level}`, run: () => addOnPage(made, level, "ability") },
    ...(roomForPassive(made, page) ? [{ label: page === GENERAL ? `add a passive at level ${level}` : "add this specialization's passive", run: () => addOnPage(made, level, "passive") }] : []),
  ];
}

function tileItems(made, tile) {
  if (tile.kind !== "ability") {
    return [
      { label: "edit", run: () => pickTile(tile) },
      {
        label: "delete",
        confirm: `yes, delete ${tile.name}`,
        run: () => {
          removePassive(made, tile);
          change(made);
          part = null;
          show();
        },
      },
    ];
  }
  const specs = (made.specializations ?? []).map((s) => ({
    label: `${s.abilities?.includes(tile.id) ? "take off" : "put on"} ${s.name || s.id}`,
    run: () => {
      toggleOnSpec(made, tile.id, s.id);
      change(made);
      show();
    },
  }));
  return [
    { label: "edit", run: () => openAbility(tile.id) },
    {
      label: "duplicate",
      run: () => {
        const copy = duplicateAbility(made, tile.id);
        change(made);
        openAbility(copy.id);
      },
    },
    ...specs,
    {
      label: "delete",
      confirm: `yes, delete ${tile.name}`,
      run: () => {
        removeAbility(made, tile.id);
        change(made);
        if (part?.id === tile.id) part = null;
        show();
      },
    },
  ];
}

function pickTile(tile) {
  part = tile.kind === "ability" ? { kind: "ability", id: tile.id } : tile.kind === "passive" ? { kind: "passive", index: tile.index } : { kind: "specPassive", spec: tile.spec };
  show();
}

const tileIsPart = (tile) =>
  (part?.kind === "ability" && tile.kind === "ability" && part.id === tile.id) || (part?.kind === "passive" && tile.kind === "passive" && part.index === tile.index) || (part?.kind === "specPassive" && tile.kind === "specPassive" && part.spec === tile.spec);

function showBoard(made) {
  const board = $("board");
  board.hidden = !made || tab === "class";
  board.classList.toggle("wide", tab !== "book");
  if (board.hidden) return board.replaceChildren();
  if (tab === "book") {
    if (!bookPages(made).some((p) => p.id === page)) page = GENERAL;
    board.replaceChildren(
      ...spellbookBoard(made, {
        page,
        isActive: tileIsPart,
        on: {
          page: (id) => {
            page = id;
            part = null;
            show();
          },
          pick: pickTile,
          tileMenu: (tile, x, y) => showMenu(x, y, tileItems(made, tile)),
          addMenu: (level, x, y) => showMenu(x, y, addItems(made, level)),
        },
      }),
    );
  } else if (tab === "talents") {
    const add = (level) => {
      const talent = addTalent(made, level);
      change(made);
      part = { kind: "talent", level, id: talent.id };
      show();
      $("config").querySelector("input")?.select();
    };
    board.replaceChildren(
      ...talentBoard(made, {
        isActive: (level, t) => part?.kind === "talent" && part.id === t.id,
        on: {
          pick: (level, t) => {
            part = { kind: "talent", level, id: t.id };
            show();
          },
          tierMenu: (level, x, y) => showMenu(x, y, [{ label: `add a level ${level} talent`, run: () => add(level) }]),
          cardMenu: (level, t, x, y) =>
            showMenu(x, y, [
              { label: `add a level ${level} talent`, run: () => add(level) },
              {
                label: "delete",
                confirm: `yes, delete ${t.name}`,
                run: () => {
                  removeTalent(made, String(level), t.id);
                  change(made);
                  if (part?.id === t.id) part = null;
                  show();
                },
              },
            ]),
        },
      }),
    );
  } else {
    const add = () => {
      const status = addStatus(made);
      change(made);
      show();
      openStatus(made, status.id);
      $("statusDialog").querySelector("input")?.select();
    };
    board.replaceChildren(
      ...statusBoard(made, {
        filter: statusFilter,
        on: {
          pick: (s) => openStatus(made, s.id),
          add,
          menu: (s, x, y) => {
            const uses = usedBy(made, s.id).length;
            showMenu(x, y, [
              { label: "edit", run: () => openStatus(made, s.id) },
              {
                label: "delete",
                confirm: uses ? `yes, delete it (${uses} still use it)` : "yes, delete it",
                run: () => {
                  removeStatus(made, s.id);
                  change(made);
                  show();
                },
              },
            ]);
          },
        },
      }),
    );
  }
}

// What a passive or a specialization's passive holds, as fields over its entry.
const passiveFieldsFor = (made) => classFields(made).find((field) => field.key === "passives").fields;
const specPassiveFieldsFor = (made) => classFields(made).find((field) => field.key === "specializations").fields.filter((field) => field.key === "status").map(({ advanced, ...field }) => field);

// What a passive's status does, in a line each. Opening the status is how to change it.
function passiveSummary(made, id) {
  const status = statusOf(made, id);
  const lines = status ? statusSummary(status) : [];
  const box = el("div", { className: "passive-summary" });
  if (!status) return box;
  if (lines.length) box.append(el("ul", {}, ...lines.map((line) => el("li", { textContent: line }))));
  else box.append(el("p", { className: "board-empty", textContent: "It doesn't do anything yet." }));
  const open = el("button", { type: "button", textContent: lines.length ? "change what it does" : "make it do something" });
  open.addEventListener("click", () => openStatus(made, id));
  box.append(open);
  return box;
}

// The form for what's picked on this tab.
function showConfig(made) {
  const config = $("config");
  config.replaceChildren();
  if (!made) {
    config.textContent = open ? "Pick a class, or make a new one." : "Open a repo above, or a world in /create first.";
    return;
  }
  const inTab = tab === "class" ? null : part;
  const thing = !inTab
    ? made
    : inTab.kind === "ability"
      ? made.abilities?.find((a) => a.id === inTab.id)
      : inTab.kind === "passive"
        ? made.passives?.[inTab.index]
        : inTab.kind === "specPassive"
          ? made.specializations?.find((s) => s.id === inTab.spec)
          : made.talents?.[inTab.level]?.find((t) => t.id === inTab.id);
  if (tab !== "class" && !thing) part = null;
  if (tab !== "class" && (!inTab || !thing)) {
    config.append(el("p", { className: "board-empty", textContent: tab === "book" ? "Pick an ability or a passive. Right-click to add one, or to duplicate or delete." : tab === "talents" ? "Pick a talent. Right-click a level to add one." : "Pick a status to edit it." }));
    return;
  }
  const hooks = {
    changed: () => {
      change(made);
      showProblems(made);
      showClassPicker(classesOf(world));
      showBoard(made);
      showPreview(made, inTab?.kind === "ability" ? thing : null);
    },
    reshaped: () => {
      hooks.changed();
      const top = config.scrollTop;
      showConfig(made);
      config.scrollTop = top;
    },
    status: statusHooks(made),
    tryIt: () => preview?.play(),
    openAbility: (id) => {
      tab = "book";
      page = GENERAL;
      openAbility(id);
    },
    openPage: (id) => {
      tab = "book";
      page = id;
      part = null;
      show();
    },
  };
  if (!inTab) {
    const remove = el("button", { type: "button", textContent: "delete class", className: "form-remove" });
    const sure = el("button", { type: "button", textContent: `yes, delete ${made.name || "this class"}`, className: "form-remove", hidden: true });
    const keepIt = el("button", { type: "button", textContent: "keep it", hidden: true });
    const asking = (on) => {
      remove.hidden = on;
      sure.hidden = keepIt.hidden = !on;
    };
    remove.addEventListener("click", () => asking(true));
    keepIt.addEventListener("click", () => asking(false));
    sure.addEventListener("click", () => {
      world.files.delete(classPath(made.id));
      keep();
      pick(null);
    });
    config.append(el("div", { className: "classes-delete" }, remove, sure, keepIt), ...classBuilder(made, hooks));
  } else if (inTab.kind === "ability") config.append(...abilityBuilder(made, thing, hooks));
  else if (inTab.kind === "passive") config.append(el("h3", { textContent: "Passive" }), ...renderFields(passiveFieldsFor(made), thing, hooks), passiveSummary(made, thing.status));
  else if (inTab.kind === "specPassive") config.append(el("h3", { textContent: `${thing.name || thing.id}'s passive` }), ...renderFields(specPassiveFieldsFor(made), thing, hooks), passiveSummary(made, thing.status));
  else config.append(el("h3", { textContent: `Level ${inTab.level} talent` }), ...talentBuilder(made, thing, inTab.level, hooks));
}

// The preview's made the first time an ability's picked, since the page needs it only then.
let preview = null;
function showPreview(made, ability) {
  $("preview").hidden = !ability;
  if (!ability) return preview?.setAbility(null);
  preview ??= new AbilityPreview($("preview"));
  window.classes = { preview };
  preview.setClass(made, ability);
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
  $("classesBody").dataset.tab = tab;
  showClassPicker(classes);
  showTabs(made);
  showProblems(made);
  showBoard(made);
  showConfig(made);
  showPreview(made, tab === "book" && part?.kind === "ability" ? made?.abilities?.find((a) => a.id === part.id) : null);
}

$("classPick").addEventListener("change", () => pick($("classPick").value || null));
for (const button of $("classTabs").querySelectorAll("button")) {
  button.addEventListener("click", () => {
    tab = button.dataset.tab;
    part = null;
    show();
  });
}

$("newClass").disabled = !open;
$("newClass").addEventListener("click", () => {
  const made = newClass();
  change(made);
  tab = "class";
  pick(made.id);
  $("config").querySelector("input")?.select();
});
show();

// Saving the classes to GitHub, as one commit of their files alone.
const showSource = (source) => {
  $("repoSave").disabled = !source?.commitSha;
  $("repoSave").title = source?.commitSha ? `commit these classes to ${source.repo}` : "open a repo here, and save it there first";
};
showSource(await keptSource());
onSourceSaved(showSource);
await worldBar($("worldBar"), { say, flush: () => sync.push(), only: isClassPath, what: "classes" });
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
    if (e instanceof BranchMoved) say(`${e.message}: open the repo again, then save.`);
    else if (e instanceof GithubAuthError) say("Connect GitHub first, from your worlds page.");
    else say(`Couldn't save: ${e.message}`);
  } finally {
    showSource(await keptSource());
  }
});
