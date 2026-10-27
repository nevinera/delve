import "./editor.css";
import { updateIndexes } from "./continentIndex.js";
import { Editor } from "./editor.js";
import { exportHeightmap, importHeightmap, needsRange } from "./heightmap.js";
import { loadLocal, saveLocal } from "./localSave.js";
import { World } from "./world.js";
import { slug } from "./zones.js";
import { LAND_FT, LandGrid } from "../world/landGrid.js";

// Editor entry (plans/roadmap.md, "World editor").

const $ = (id) => document.getElementById(id);

const editor = new Editor(World.empty(), {
  map: $("map"),
  scene: $("scene"),
  overview: $("overview"),
  overviewInfo: $("overviewInfo"),
  exaggeration: $("exaggeration"),
  exaggerationValue: $("exaggerationValue"),
  scaleBar: $("scaleBar"),
  scale: $("scale"),
  zoomIn: $("zoomIn"),
  zoomOut: $("zoomOut"),
  walk: $("walk"),
  graphicsButton: $("graphicsButton"),
  timeButton: $("timeButton"),
  timePanel: $("timePanel"),
  timeOfDay: $("timeOfDay"),
  timeOfDayValue: $("timeOfDayValue"),
  moonDay: $("moonDay"),
  moonDayValue: $("moonDayValue"),
  timeSpeed: $("timeSpeed"),
  timeSpeedValue: $("timeSpeedValue"),
  timeNow: $("timeNow"),
  graphics: $("graphics"),
  graphicsResolution: $("graphicsResolution"),
  graphicsParts: $("graphicsParts"),
  solidCanopies: $("solidCanopies"),
  clutterRadius: $("clutterRadius"),
  clutterRadiusValue: $("clutterRadiusValue"),
  clutterDensity: $("clutterDensity"),
  clutterDensityValue: $("clutterDensityValue"),
  cursor: $("cursor"),
  continent: $("continent"),
  zoneList: $("zoneList"),
  newZone: $("newZone"),
  zoneEdit: $("zoneEdit"),
  steps: [...document.querySelectorAll(".editor-step")],
  stepTabs: [...document.querySelectorAll(".editor-step-tabs button")],
  zoneName: $("zoneName"),
  regionInfo: $("regionInfo"),
  drawRegion: $("drawRegion"),
  deleteZone: $("deleteZone"),
  tools: [...document.querySelectorAll("[data-tools]")],
  sculpt: $("sculpt"),
  detail: $("detail"),
  detailSize: $("detailSize"),
  detailInfo: $("detailInfo"),
  detailRadius: $("detailRadius"),
  detailRadiusValue: $("detailRadiusValue"),
  detailFalloff: $("detailFalloff"),
  detailFalloffValue: $("detailFalloffValue"),
  detailStrength: $("detailStrength"),
  detailStrengthValue: $("detailStrengthValue"),
  detailErosion: $("detailErosion"),
  detailTalus: $("detailTalus"),
  trailKind: $("trailKind"),
  trailState: $("trailState"),
  trailWidth: $("trailWidth"),
  trailWidthValue: $("trailWidthValue"),
  placeType: $("placeType"),
  placeScale: $("placeScale"),
  placeScaleValue: $("placeScaleValue"),
  objectPanel: $("objectPanel"),
  objectInfo: $("objectInfo"),
  objectYaw: $("objectYaw"),
  objectYawValue: $("objectYawValue"),
  objectScale: $("objectScale"),
  objectScaleValue: $("objectScaleValue"),
  objectDelete: $("objectDelete"),
  brushSize: $("brushSize"),
  brushSizeValue: $("brushSizeValue"),
  brushStrength: $("brushStrength"),
  brushStrengthValue: $("brushStrengthValue"),
  setHeight: $("setHeight"),
  terraceStep: $("terraceStep"),
  stampShape: $("stampShape"),
  stampBlend: $("stampBlend"),
  stampHeight: $("stampHeight"),
  erosionKind: $("erosionKind"),
  talus: $("talus"),
  landStatus: $("landStatus"),
  commitLand: $("commitLand"),
  discardLand: $("discardLand"),
  biomeChoices: $("biomeChoices"),
  biomeTags: $("biomeTags"),
  tilesInfo: $("tilesInfo"),
  generate: $("generate"),
  regenerateAll: $("regenerateAll"),
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

$("exportHeightmap").addEventListener("click", () => {
  const map = exportHeightmap(editor.land);
  if (!map) return window.alert("There's no land to export yet.");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([map.bytes], { type: "image/png" }));
  link.download = `${slug(editor.world.info.name) || "world"}-${editor.continent}-heights.png`;
  link.click();
  URL.revokeObjectURL(link.href);
});

$("importHeightmap").addEventListener("click", () => $("heightmapFile").click());

// A heightmap from another tool needs telling what heights black and white stand for. It's put
// down centred on the point the heights view looks at, a pixel every LAND_FT ft.
$("heightmapFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let range = null;
    if (needsRange(bytes)) {
      const answer = window.prompt(`What heights do black and white stand for, in ft? Each pixel is ${LAND_FT}ft across.`, "-50 1000");
      if (answer === null) return;
      range = answer.split(/[\s,]+/).filter(Boolean).map(Number);
      if (range.length !== 2 || !range.every(Number.isFinite)) throw new Error("give two heights, like -50 1000");
    }
    if (editor.land.blocks.size && !window.confirm("Replace the land being sculpted with this heightmap? Discard brings back the committed land.")) return;
    editor.replaceLand(importHeightmap(bytes, { range, centre: editor.sculpt?.centre ?? [0, 0] }));
  } catch (err) {
    window.alert(`Couldn't import ${file.name}: ${err.message}`);
  }
});

$("importBones").addEventListener("click", () => $("bonesFile").click());

// A bones file (bones.js) runs in a worker, and its land replaces the land being sculpted.
$("bonesFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  let bones;
  try {
    bones = JSON.parse(await file.text());
  } catch (err) {
    return window.alert(`Couldn't read ${file.name}: ${err.message}`);
  }
  if (editor.land.blocks.size && !window.confirm("Replace the land being sculpted with this bones file's? Discard brings back the committed land.")) return;
  editor.say(`Running ${file.name}...`, { info: true });
  const worker = new Worker(new URL("./bonesWorker.js", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => {
    worker.terminate();
    if (data.error) {
      editor.say();
      return window.alert(`Couldn't run ${file.name}: ${data.error}`);
    }
    editor.replaceLand(LandGrid.from({ blocks: data.blocks }));
    editor.say(`Ran ${file.name}. Commit to keep its land.`, { info: true });
  };
  worker.postMessage(bones);
});

$("newWorld").addEventListener("click", () => {
  if (editor.dirty && !window.confirm("Start a new world? Changes you haven't downloaded will be lost.")) return;
  editor.setWorld(World.empty());
  $("worldName").textContent = editor.world.info.name;
  keep();
});

$("upload").addEventListener("click", () => {
  if (editor.dirty && !window.confirm("Replace this world? Changes you haven't downloaded will be lost.")) return;
  $("uploadFile").click();
});

// The server's shared default world, for working without a file at hand (it isn't part of the
// repo; it's copied onto each server). no-cache, so a replaced one comes through.
const DEFAULT_WORLD = "/worlds/default.zip";

$("loadDefault").addEventListener("click", async () => {
  if (editor.dirty && !window.confirm("Replace this world with the default one? Changes you haven't downloaded will be lost.")) return;
  try {
    const response = await fetch(DEFAULT_WORLD, { cache: "no-cache" });
    if (!response.ok) throw new Error(response.status === 404 ? "this server has no default world" : `the server said ${response.status}`);
    editor.setWorld(World.fromZip(new Uint8Array(await response.arrayBuffer())));
    $("worldName").textContent = editor.world.info.name;
    keep();
  } catch (err) {
    window.alert(`Couldn't load the default world: ${err.message}`);
  }
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
