import "./editor.css";
import { updateIndexes } from "./continentIndex.js";
import { Editor } from "./editor.js";
import { BranchMoved, fromRepo, loadFromGithub, recordOpened, sameRepo, saveToGithub } from "./githubWorld.js";
import { exportHeightmap, importHeightmap, needsRange } from "./heightmap.js";
import { LibrarySync } from "./libraryStore.js";
import { loadLocal, saveLocal } from "./localSave.js";
import { placeKey } from "./place.js";
import { PlatePool } from "./plates.js";
import { PublishPanel } from "./publish.js";
import { World } from "./world.js";
import { slug } from "./zones.js";
import { LAND_FT, LandGrid } from "../world/landGrid.js";
import { GithubAuthError, GithubClient } from "../github/github.js";

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
  cursor: $("cursor"),
  continent: $("continent"),
  zoneList: $("zoneList"),
  newZone: $("newZone"),
  zoneEdit: $("zoneEdit"),
  steps: [...document.querySelectorAll(".editor-step")],
  stepTabs: [...document.querySelectorAll(".editor-step-tabs button[data-step]")],
  zoneName: $("zoneName"),
  regionInfo: $("regionInfo"),
  drawRegion: $("drawRegion"),
  deleteZone: $("deleteZone"),
  tools: [...document.querySelectorAll("[data-tools]")],
  sculpt: $("sculpt"),
  detail: $("detail"),
  openLibrary: $("openLibrary"),
  libraryPopover: $("libraryPopover"),
  libraryGallery: $("libraryGallery"),
  openStructures: $("openStructures"),
  structurePopover: $("structurePopover"),
  structureGallery: $("structureGallery"),
  detailSize: $("detailSize"),
  detailInfo: $("detailInfo"),
  detailPick: $("detailPick"),
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
  channelWidth: $("channelWidth"),
  channelWidthValue: $("channelWidthValue"),
  channelDepth: $("channelDepth"),
  channelDepthValue: $("channelDepthValue"),
  pourWidth: $("pourWidth"),
  pourWidthValue: $("pourWidthValue"),
  pourPanel: $("pourPanel"),
  pourInfo: $("pourInfo"),
  pourKeep: $("pourKeep"),
  pourDrop: $("pourDrop"),
  replaceFrom: $("replaceFrom"),
  replaceTo: $("replaceTo"),
  replaceObjects: $("replaceObjects"),
  objectPicker: $("objectPicker"),
  structurePicker: $("structurePicker"),
  groupInfo: $("groupInfo"),
  templateSaveRow: $("templateSaveRow"),
  templateName: $("templateName"),
  templateGround: $("templateGround"),
  templateSave: $("templateSave"),
  replaceOpen: $("replaceOpen"),
  replaceDialog: $("replaceDialog"),
  replaceCancel: $("replaceCancel"),
  paintTerrain: $("paintTerrain"),
  treeKindRow: $("treeKindRow"),
  treeKind: $("treeKind"),
  treeSizeRow: $("treeSizeRow"),
  treeSize: $("treeSize"),
  paintRadius: $("paintRadius"),
  paintRadiusValue: $("paintRadiusValue"),
  objectPanel: $("objectPanel"),
  objectInfo: $("objectInfo"),
  objectYaw: $("objectYaw"),
  objectYawValue: $("objectYawValue"),
  objectScale: $("objectScale"),
  objectScaleValue: $("objectScaleValue"),
  objectSizeRow: $("objectSizeRow"),
  objectBaseRow: $("objectBaseRow"),
  objectBaseValue: $("objectBaseValue"),
  objectLower: $("objectLower"),
  objectRaise: $("objectRaise"),
  objectDelete: $("objectDelete"),
  objectColors: $("objectColors"),
  objectTexts: $("objectTexts"),
  slabSelect: $("slabSelect"),
  slabFloor: $("slabFloor"),
  slabWall: $("slabWall"),
  slabRoom: $("slabRoom"),
  slabRoof: $("slabRoof"),
  slabRoofRow: $("slabRoofRow"),
  slabRoomRoofRow: $("slabRoomRoofRow"),
  slabRoomRoof: $("slabRoomRoof"),
  slabRoofFlat: $("slabRoofFlat"),
  slabRoofShed: $("slabRoofShed"),
  slabRoofGable: $("slabRoofGable"),
  slabRoofHip: $("slabRoofHip"),
  slabPitchRow: $("slabPitchRow"),
  slabPitch: $("slabPitch"),
  slabOverhang: $("slabOverhang"),
  slabRect: $("slabRect"),
  slabPoly: $("slabPoly"),
  slabSwatches: $("slabSwatches"),
  slabCustom: $("slabCustom"),
  slabCustomUse: $("slabCustomUse"),
  slabCustomCancel: $("slabCustomCancel"),
  slabThickness: $("slabThickness"),
  slabHeight: $("slabHeight"),
  slabKeep: $("slabKeep"),
  slabKeepRow: $("slabKeepRow"),
  slabShapeRow: $("slabShapeRow"),
  slabHandleRow: $("slabHandleRow"),
  slabHeightRow: $("slabHeightRow"),
  slabConformRow: $("slabConformRow"),
  slabConform: $("slabConform"),
  slabColor: $("slabColor"),
  slabPattern: $("slabPattern"),
  slabTexture: $("slabTexture"),
  slabTileEvery: $("slabTileEvery"),
  slabPanel: $("slabPanel"),
  slabInfo: $("slabInfo"),
  slabMove: $("slabMove"),
  slabTurn: $("slabTurn"),
  slabCut: $("slabCut"),
  slabClearHoles: $("slabClearHoles"),
  slabRaise: $("slabRaise"),
  slabDelete: $("slabDelete"),
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

// Plates are packed and unpacked on these workers (plates.js).
const plates = new PlatePool();
const progress = (what) => ({ done, total }) => editor.say(`${what}: ${done} of ${total} plates...`, { info: true });

// Opens a world from its stored files, splitting its plates into tiles.
async function unpacked(world) {
  await world.unpack({ pool: plates, onProgress: progress("Opening") });
  return world;
}

$("download").addEventListener("click", async () => {
  updateIndexes(editor.world);
  const stored = await editor.world.stored({ pool: plates, onProgress: progress("Packing") });
  editor.say("");
  const blob = new Blob([editor.world.toZip(stored)], { type: "application/zip" });
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

// The object library is kept apart from the rest of the world (libraryStore.js), shared with the
// objects page; another tab's changes come in here.
const library = new LibrarySync(editor.world, () => {
  editor.dirty = true;
  editor.loadBuiltObjects();
});

// Where the world came from (githubWorld.js), or null for a new or uploaded one.
let source = null;
// The world kept in this browser had changes that weren't saved.
let keptUnsaved = false;

function setSource(from) {
  source = from;
  $("saveGithub").hidden = !source;
  $("saveGithub").title = source ? `Commits your changes to ${source.repo}` : "";
  publish.invalidate();
}

// Saving opens a dialog that logs the save as it goes, and can't be closed until it's done.
const saveDialog = $("saveDialog");
let saving = false;

function logSave(text, kind = "") {
  const item = document.createElement("li");
  item.textContent = text;
  if (kind) item.className = kind;
  $("saveLog").append(item);
  item.scrollIntoView({ block: "nearest" });
}

function setSaving(on) {
  saving = on;
  for (const id of ["saveMessage", "saveStart", "saveClose"]) $(id).disabled = on;
}

$("saveGithub").addEventListener("click", () => {
  $("saveMessage").value = `Edit ${editor.world.info.name}`;
  $("saveLog").replaceChildren();
  $("saveProgress").textContent = `Commits your changes to ${source.repo}, on ${source.branch}.`;
  setSaving(false);
  saveDialog.showModal();
  $("saveMessage").select();
});

saveDialog.addEventListener("cancel", (e) => {
  if (saving) e.preventDefault();
});
$("saveClose").addEventListener("click", () => saveDialog.close());
$("saveMessage").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("saveStart").click();
});

$("saveStart").addEventListener("click", async () => {
  const message = $("saveMessage").value.trim() || "Edit the world";
  setSaving(true);
  const progress = $("saveProgress");
  let moved = null;
  try {
    updateIndexes(editor.world);
    const onProgress = ({ stage, done, total }) => (progress.textContent = stage === "packing" ? `Packing plates: ${done} of ${total}` : `Sending files: ${done} of ${total}`);
    const saved = await saveToGithub(new GithubClient(source.repo), editor.world, source, { message, pool: plates, onProgress, log: logSave });
    if (saved) setSource(saved);
    keptUnsaved = false;
    editor.markSaved();
    keep();
    progress.textContent = "";
    logSave(saved ? `Saved to ${source.repo}.` : "Nothing's changed since it was last saved.", "done");
    $("saveStart").disabled = true;
    publish.invalidate();
    if (editor.step === "publish") publish.refresh();
  } catch (err) {
    progress.textContent = "";
    if (err instanceof BranchMoved) {
      logSave(`${err.message}, so saving would drop what's there.`, "error");
      moved = err;
    } else if (err instanceof GithubAuthError) logSave("Connect GitHub to save, on your home page.", "error");
    else logSave(`Couldn't save: ${err.message}`, "error");
  } finally {
    saving = false;
    $("saveClose").disabled = false;
    $("saveMessage").disabled = false;
    if (!$("saveLog").lastElementChild?.classList.contains("done")) $("saveStart").disabled = false;
  }
  if (moved && window.confirm(`${moved.message}. Open it again from GitHub? Changes here that aren't saved will be lost; download the world first to keep them.`)) {
    saveDialog.close();
    await openRepo(source.repo, { fresh: true });
  }
});

// The publish step (publish.js), which tags the saved commit as a version once it validates.
const publish = new PublishPanel(
  {
    where: $("publishWhere"),
    facts: $("publishFacts"),
    validate: $("validate"),
    validateInfo: $("validateInfo"),
    problems: $("validateProblems"),
    tag: $("publishTag"),
    publish: $("publish"),
    info: $("publishInfo"),
  },
  { world: () => editor.world, source: () => source, beforeStore: () => updateIndexes(editor.world), pool: plates },
);
editor.onStep = (step) => {
  if (step === "publish") publish.refresh();
};

// Starts on a new, uploaded or opened world, its library replacing the one kept in this browser,
// back where you were in it unless it's `fresh`.
function startWorld(world, from = null, { fresh = false } = {}) {
  setSource(from);
  editor.setWorld(world);
  editor.resume(placeKey(world, from), { fresh });
  $("worldName").textContent = editor.world.info.name;
  library.replace(editor.world).catch((err) => editor.say(`Couldn't keep the object library in this browser: ${err.message}`));
  keep();
}

$("newWorld").addEventListener("click", () => {
  if (editor.dirty && !window.confirm("Start a new world? Changes you haven't downloaded will be lost.")) return;
  startWorld(World.empty(), null, { fresh: true });
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
    startWorld(await unpacked(World.fromZip(new Uint8Array(await response.arrayBuffer()))));
  } catch (err) {
    window.alert(`Couldn't load the default world: ${err.message}`);
  }
});

$("uploadFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    startWorld(await unpacked(World.fromZip(new Uint8Array(await file.arrayBuffer()))));
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
    await library.push();
    await saveLocal({ zip: editor.world.toZip(), pending: [...editor.pending], dirty: editor.dirty, source });
    keeping = keepTimer !== null;
  } catch (err) {
    editor.say(`Couldn't keep the world in this browser: ${err.message}`);
  }
}

editor.onEdit = () => {
  publish.invalidate();
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

let resumeKey = null; // the kept world's place, gone back to once its library's in
try {
  const saved = await loadLocal();
  if (saved) {
    editor.setWorld(World.fromZip(saved.zip));
    setSource(saved.source ?? null);
    keptUnsaved = Boolean(saved.dirty);
    for (const key of saved.pending ?? []) editor.pending.add(key);
    editor.unsaved = Boolean(saved.dirty);
    editor.renderPanel();
    $("worldName").textContent = editor.world.info.name;
    resumeKey = placeKey(editor.world, source);
    editor.say(`Picked up where you left off (kept ${new Date(saved.savedAt).toLocaleString()}).`, { info: true });
  }
} catch (err) {
  editor.say(`Couldn't load the world kept in this browser: ${err.message}`);
}
// The library kept in this browser is newer than the copy in the kept world's zip.
try {
  library.world = editor.world;
  await library.pull();
  // Loading moves images kept the old way (adoptStrays), which the store should hear about.
  editor.loadBuiltObjects();
  await library.push();
} catch (err) {
  editor.say(`Couldn't load the object library kept in this browser: ${err.message}`);
}
if (resumeKey) editor.resume(resumeKey);

// Opens the repo named by ?from=github/owner/repo. Unsaved changes to this same world are kept;
// unsaved changes to another are dropped only if you agree, and otherwise the editor stays on it.
// Opening the same world again downloads only what changed.
// Opens a repo's world, `fresh` from GitHub, ignoring what's kept in this browser, if asked.
async function openRepo(repo, { fresh = false } = {}) {
  const same = !fresh && sameRepo(source?.repo, repo);
  if (same && keptUnsaved) return opened(repo, `Picked up your unsaved changes to ${repo}.`);
  if (!fresh && !same && keptUnsaved && !window.confirm(`Drop your unsaved changes to ${editor.world.info.name} and open ${repo}?`)) {
    window.history.replaceState(window.history.state, "", window.location.pathname);
    return;
  }
  editor.say(`Opening ${repo}...`, { info: true });
  try {
    const client = new GithubClient(repo);
    if (same && source.commitSha && (await client.headSha(source.branch)) === source.commitSha) return opened(repo, `Opened ${repo}.`);
    const onProgress = ({ done, total }) => editor.say(`Opening ${repo}: ${done} of ${total} files...`, { info: true });
    const loaded = await loadFromGithub(client, { kept: fresh ? null : { world: editor.world, source }, onProgress, pool: plates });
    startWorld(loaded.world, loaded.source);
    opened(repo, loaded.source.commitSha ? `Opened ${repo}.` : `${repo} is empty, so this is a new world.`);
  } catch (err) {
    if (err instanceof GithubAuthError) editor.say("Connect GitHub to open worlds from it, on your home page.");
    else editor.say(`Couldn't open ${repo}: ${err.message}`);
  }
}

function opened(repo, message) {
  editor.say(message, { info: true });
  recordOpened(repo, editor.world.info.name).catch((err) => editor.say(`Opened ${repo}, but couldn't add it to your worlds: ${err.message}`));
}

const from = new URLSearchParams(window.location.search).get("from");
if (from) {
  const repo = fromRepo(from);
  if (repo) await openRepo(repo);
  else editor.say(`Can't open ${from}: give it as github/owner/repo.`);
}
