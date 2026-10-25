import "./editor.css";
import { updateIndexes } from "./continentIndex.js";
import { Editor } from "./editor.js";
import { loadLocal, saveLocal } from "./localSave.js";
import { World } from "./world.js";
import { slug } from "./zones.js";

// Editor entry (plans/roadmap.md, "World editor").

const $ = (id) => document.getElementById(id);

const editor = new Editor(World.empty(), {
  map: $("map"),
  scene: $("scene"),
  showPins: $("showPins"),
  sceneTip: $("sceneTip"),
  walk: $("walk"),
  cursor: $("cursor"),
  continent: $("continent"),
  zoneList: $("zoneList"),
  newZone: $("newZone"),
  noZone: $("noZone"),
  stepTabs: $("stepTabs"),
  viewTabs: $("viewTabs"),
  steps: [...document.querySelectorAll(".editor-step")],
  zoneName: $("zoneName"),
  regionInfo: $("regionInfo"),
  drawRegion: $("drawRegion"),
  deleteZone: $("deleteZone"),
  tools: [...document.querySelectorAll("[data-tools]")],
  treeKind: $("treeKind"),
  heightPalette: $("heightPalette"),
  heightSlider: $("heightSlider"),
  heightValue: $("heightValue"),
  biomePalette: $("biomePalette"),
  biomeChoices: $("biomeChoices"),
  biomeTags: $("biomeTags"),
  shapeShow: [...document.querySelectorAll("input[name=shapeShow]")],
  showRivers: $("showRivers"),
  generate: $("generate"),
  regenerate: $("regenerate"),
  highlight: $("highlight"),
  showBiomes: $("showBiomes"),
  pendingInfo: $("pendingInfo"),
  props: $("props"),
  hint: $("hint"),
  message: $("message"),
});

$("download").addEventListener("click", () => {
  updateIndexes(editor.world);
  const blob = new Blob([editor.world.toZip()], { type: "application/zip" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${slug(editor.world.info.name) || "world"}.zip`;
  link.click();
  URL.revokeObjectURL(link.href);
  editor.markSaved();
  keep();
});

$("upload").addEventListener("click", () => {
  if (editor.dirty && !window.confirm("Replace this world? Changes you haven't downloaded will be lost.")) return;
  $("uploadFile").click();
});

$("uploadFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    editor.setWorld(World.fromZip(new Uint8Array(await file.arrayBuffer())));
    $("worldName").textContent = editor.world.info.name;
    keep();
  } catch (err) {
    window.alert(`Couldn't load ${file.name}: ${err.message}`);
  }
});

$("worldName").textContent = editor.world.info.name;

// The world is kept in the browser a moment after each change, and comes back on reload.
const KEEP_DELAY_MS = 1000;
let keepTimer = null;
let keeping = false; // a change hasn't been kept yet

async function keep() {
  clearTimeout(keepTimer);
  keepTimer = null;
  try {
    await saveLocal({ zip: editor.world.toZip(), pending: [...editor.pending], dirty: editor.dirty });
    keeping = keepTimer !== null;
  } catch (err) {
    editor.say(`Couldn't keep the world in this browser: ${err.message}`);
  }
}

editor.onEdit = () => {
  keeping = true;
  clearTimeout(keepTimer);
  keepTimer = setTimeout(keep, KEEP_DELAY_MS);
};

window.addEventListener("beforeunload", (e) => {
  if (keeping) e.preventDefault();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && keepTimer) keep();
});

try {
  const saved = await loadLocal();
  if (saved) {
    editor.setWorld(World.fromZip(saved.zip));
    for (const key of saved.pending ?? []) editor.pending.add(key);
    editor.unsaved = Boolean(saved.dirty);
    editor.renderPanel();
    $("worldName").textContent = editor.world.info.name;
    editor.say(`Picked up where you left off (kept ${new Date(saved.savedAt).toLocaleString()}).`, { info: true });
  }
} catch (err) {
  editor.say(`Couldn't load the world kept in this browser: ${err.message}`);
}
