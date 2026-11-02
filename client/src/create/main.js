import "./create.css";
import * as THREE from "three";
import { strFromU8, strToU8, unzipSync, zip, zipSync } from "fflate";
import { PLATE_PATH, decodePlate } from "../v2/plate.js";
import { PLATTER_PATH } from "../v2/platter.js";
import { PLATE_FT, SEA_LEVEL_FT, TILE_FT } from "../v2/sizes.js";
import { BIOME_NAMES } from "../v2/biomes.js";
import { waterPath } from "../v2/water.js";
import { BIOMES, biomesPath } from "./biomes.js";
import { Builder } from "./builder.js";
import { Compass, facing } from "./compass.js";
import { EMPTY_FT, FAR_FT, FINE, Ground, REACH_FT, Renditions } from "./ground.js";
import { grid } from "./grid.js";
import { planningPath } from "./marks.js";
import { Clutter } from "./clutter.js";
import { Falls } from "./falls.js";
import { Scatter } from "./scatter.js";
import { Sea } from "./sea.js";
import { WaterSurfaces } from "./waterSurface.js";
import { Tools } from "./tools.js";
import { Library } from "./library.js";
import { PLACED_PATH, Placed } from "./placed.js";
import { pressesOver } from "./press.js";
import { readLibrary, store, writeLibrary } from "./store.js";
import { LibrarySync } from "../editor/libraryStore.js";
import { Things } from "./things.js";
import { GithubAuthError, GithubClient } from "../github/github.js";
import { BranchMoved, fromRepo, loadRepo, nextVersion, recordOpened, repoChanges, sameRepo, saveRepo } from "./repo.js";
import { CAVES_PATH, Caves } from "./caves.js";
import { VOXEL_FT } from "../v2/caves.js";
import { Layout, layoutPath } from "./caveLayout.js";
import { Overhead } from "./overhead.js";
import { Earth } from "./earth.js";

// /create: the new editor, so far a builder walking and flying over a version 2 world's ground.
// The world comes from a zip you upload (script/convert-v2.mjs makes one from a v1 world) or a
// GitHub repo (`?from=github/owner/repo`, repo.js), kept in this browser so a reload opens it
// again, with the builder where they were. Opening another replaces it. Downloading it gives a zip of it with the ground as it's been moved. A new world has
// nothing in it: no tiles, all sea.

const $ = (id) => document.getElementById(id);
const SKY = 0x9cc4e4;
const UNDERGROUND = 0x000000; // the sky, with the camera under the ground
const OVERHEAD_EVERY_MS = 1000; // how often the ground drawn over the camera underground's read again
// Where fog starts and closes in, as shares of how far off ground's drawn.
const FOG = { near: 0.5, far: 1.02 };
const [NEAR_FT, NEAR_PER_FT, NEAR_MOST_FT] = [0.5, 0.001, 100]; // the camera's near plane, by how high it is
const UNDERWATER = { color: 0x1d4f5c, nearFt: -10, farFt: 70 }; // the fog with the camera under water
const SAVE_EVERY_MS = 2000;
const SEA_BELOW_FT = 2;
const HUD_EVERY_MS = 250;
const BUILDER_RADIUS_FT = 1; // how much room the builder takes, walking among trees and objects
const STEP_FT = 2.5; // how far up the builder steps onto a slab, or a cave's floor
const HEAD_FT = 6; // how tall the builder is, for cave rock in the way
const MID_FT = 3; // how far up the builder they're in the earth where it's rock
const INFO_EVERY_MS = 100;

// The world's kept in IndexedDB (store.js): the zip opened last, or the files of the repo's commit
// opened or saved last, with that commit ("source"), and the files changed since, saved a little
// after each change, so a reload opens the world as it was left.
const SAVE_CHANGES_MS = 3000;

// A v2 world's name, its files (path -> bytes) and its first continent's renditions, from the zip's
// bytes or its files, with `changes` (path -> bytes) in place of its own files.
function readWorld(base, changes = new Map()) {
  let files = base instanceof Map ? [...base] : Object.entries(unzipSync(base));
  if (!(base instanceof Map) && !files.some(([path]) => path === "world.json")) {
    const top = files[0][0].split("/")[0];
    files = files.map(([path, b]) => [path.slice(top.length + 1), b]);
  }
  // A change of null is a file taken away.
  files = [...new Map([...files, ...changes])].filter(([, b]) => b);
  const info = JSON.parse(strFromU8(Object.fromEntries(files)["world.json"]));
  if (info.version !== 2) throw new Error(`this is a version ${info.version} world: convert it with script/convert-v2.mjs first`);
  const continent = info.continents[0].key;
  const renditions = new Renditions();
  for (const [path, b] of files) {
    if (PLATTER_PATH.exec(path)?.[1] === continent) renditions.addPlatter(b);
    const plate = PLATE_PATH.exec(path);
    if (plate?.[1] === continent) renditions.addPlate([Number(plate[2]), Number(plate[3])], b);
  }
  // Plate files are read as you come near them, so check one now, to say straight away when
  // they're from an older converter.
  const first = renditions.plateFiles.values().next().value;
  if (!first && renditions.platters.size) throw new Error("this world has no plate files: convert it again with script/convert-v2.mjs");
  try {
    if (first) decodePlate(first);
  } catch (e) {
    throw new Error(`this world's plate files can't be read (${e.message}): convert it again with script/convert-v2.mjs`);
  }
  return { name: info.name, files: new Map(files), continent, renditions };
}

// The world's files with `changes` (path -> bytes, null for gone) in place of its own.
function withChanges(files, changes) {
  const out = new Map(files);
  for (const [path, bytes] of changes) {
    if (bytes) out.set(path, bytes);
    else out.delete(path);
  }
  return out;
}

// Saves the world as a zip, with the files changed since it was opened, `changes`, saved first by
// save(). Files gzipped already are stored as they are, and the rest (text plates and platters
// among them) deflated, zipped off the page's thread.
async function download({ name, files }, changes, save) {
  await save();
  const out = withChanges(files, changes);
  const zipped = await new Promise((resolve, reject) => zip(Object.fromEntries([...out].map(([path, bytes]) => [path, [bytes, { level: bytes[0] === 0x1f && bytes[1] === 0x8b ? 0 : 6 }]])), (error, bytes) => (error ? reject(error) : resolve(bytes))));
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([zipped], { type: "application/zip" }));
  link.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase() || "world"}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

function start(world, changes, fresh) {
  const { name, continent, renditions } = world;
  $("open").hidden = true;
  $("worldName").textContent = name;
  const canvas = $("view");
  // A logarithmic depth buffer, so ground miles off doesn't flicker where faces nearly meet.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  // A pixel a CSS pixel, even on high-density screens: the editor needn't be crisp.
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, FAR_FT * FOG.near, FAR_FT * FOG.far);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, REACH_FT * 4);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x55503c, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.8);
  sun.position.set(0.5, 1, 0.3);
  scene.add(sun, sun.target);
  // The ground draws the water of tiles drawn from renditions, the surfaces that of nearer tiles,
  // and the sea's plane the rest.
  const ground = new Ground(scene, renditions, renderer);
  const surfaces = new WaterSurfaces(scene, renditions, renderer, ground);
  const sea = new Sea(scene, REACH_FT * 6, renditions, surfaces);
  // Trees and objects in the tiles' slots round the builder.
  const scatter = new Scatter(scene, renditions);
  // Reeds, pebbles and the like by the water near the builder.
  const clutter = new Clutter(scene, renditions);
  // Courses' falls near the builder.
  const falls = new Falls(scene, renditions, renderer);
  // The builder stands on the ground, and swims in deep water.
  const groundAt = (x, z) => renditions.heightAt(x, z) ?? EMPTY_FT;
  const waterAt = (x, z) => renditions.waterAt(x, z);
  // The world's objects and templates, and the objects and slabs placed by hand.
  const library = new Library(world.files, name);
  // What was copied last is kept in this browser for each world, not in its files.
  const clipboardKey = `clipboard:${name}`;
  library.keepClipboard = (template) => store.set(clipboardKey, template).catch(() => {});
  // The library's kept in this browser apart from the rest of the world, where the objects page
  // changes it too (editor/libraryStore.js): a world opened anew puts its library there, and one
  // opened again takes what's there. Changes go there, and come from there.
  const sync = new LibrarySync(
    library,
    () => {
      library.register();
      tools.build.showRecent();
    },
    { read: readLibrary, write: writeLibrary, channel: "delve3d-create-library" },
  );
  let pushing = null;
  library.onChange = () => {
    pushing ??= Promise.resolve().then(() => {
      pushing = null;
      return sync.push().catch(() => {});
    });
  };
  const placed = new Placed();
  for (const [path, bytes] of world.files) {
    const match = PLACED_PATH.exec(path);
    if (match?.[1] === continent) placed.load([Number(match[2]), Number(match[3])], bytes);
  }
  // The caves dug by hand: the builder stands on their floors, and the ground at their mouths is
  // theirs to draw.
  const caves = new Caves(scene, renditions);
  const overhead = new Overhead(scene, (x, z) => renditions.heightAt(x, z));
  const earth = new Earth(scene, (x, z) => renditions.heightAt(x, z) ?? EMPTY_FT);
  let lastOverhead = 0;
  for (const [path, bytes] of world.files) {
    const match = CAVES_PATH.exec(path);
    if (match?.[1] === continent) caves.load(bytes, [Number(match[2]), Number(match[3])]);
  }
  // The cave networks laid out, to carve (caveLayout.js).
  const layoutBytes = world.files.get(layoutPath(continent));
  const layout = new Layout(layoutBytes ? JSON.parse(strFromU8(layoutBytes)) : null);
  ground.holes = (tx, tz) => caves.holes(tx, tz);
  caves.onMouths = (plates) => ground.refresh(plates);
  caves.groundMaterial = (tx, tz) => ground.fullMesh(tx, tz)?.material ?? null;
  const things = new Things(scene, placed, (x, z, under) => caves.groundAt(x, z, under));
  // Level slabs press the ground down under them (press.js).
  renditions.pressesOver = (tx, tz) => pressesOver(placed.near((tx + 0.5) * TILE_FT, (tz + 0.5) * TILE_FT, TILE_FT).slabs, tx, tz);
  let pressedVersion = placed.version;
  const placeKey = `create:${name}:${continent}`;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(placeKey));
  } catch {}
  // 1 to 4 show or hide each kind of ground, finest first.
  const KINDS = ["full", "fine", "tile", "plate"];
  window.addEventListener("keydown", (e) => {
    if (e.target.matches?.("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const kind = KINDS[Number(e.key) - 1];
    if (kind) ground.toggle(kind);
  });
  // The builder stands on slabs as well as the ground, and walls and objects are in their way.
  let builder = null;
  const feetY = () => builder?.state.y ?? saved?.y ?? 0;
  const walkAt = (x, z) => things.standAt(x, z, feetY() + STEP_FT);
  // Cave rock's in the way where it's between a step up and the builder's head, going only across
  // or only along where it's in the way of both.
  const rockAt = (x, z, y = feetY()) =>
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => caves.inRock(x + dx * BUILDER_RADIUS_FT, z + dz * BUILDER_RADIUS_FT, y + STEP_FT, y + HEAD_FT));
  const push = (x, z) => {
    const [a, b] = things.pushOut(...scatter.pushOut(x, z, BUILDER_RADIUS_FT), feetY(), BUILDER_RADIUS_FT);
    if (!builder || !rockAt(a, b)) return [a, b];
    const { x: x0, z: z0 } = builder.state;
    return [[a, z0], [x0, b]].find(([u, v]) => !rockAt(u, v)) ?? [x0, z0];
  };
  const clear = (head, at) => caves.clear(head, at);
  let tools = null;
  // They're a ghost in the earth: in rock under the ground, not in a cave's air.
  const ghost = () => {
    const { x, y, z } = builder.state;
    return caves.solid(x, y + MID_FT, z);
  };
  // Flying, cave rock's in the way too, sliding along it where it can, unless they're a ghost,
  // already in it, or soaring up (space double-tapped), which goes on up through it.
  const keep = (was, now, { soaring = false } = {}) => {
    const stuck = (s) => rockAt(s.x, s.z, s.y);
    if (!now.flying || ghost() || !stuck(now) || stuck(was) || (soaring && now.y > was.y)) return now;
    const tries = [{ y: was.y }, { x: was.x, y: was.y }, { z: was.z, y: was.y }, { x: was.x, z: was.z }, { x: was.x, y: was.y, z: was.z }];
    return tries.map((t) => ({ ...now, ...t })).find((s) => !stuck(s)) ?? { ...now, x: was.x, y: was.y, z: was.z };
  };
  const inCave = (p) => p.y < groundAt(p.x, p.z) && caves.near(p.x, p.z) && !caves.solid(p.x, p.y, p.z);
  builder = new Builder({ scene, camera, canvas, groundAt: walkAt, landAt: groundAt, waterAt, at: renditions.middle(), state: saved ?? undefined, push, clear, inCave, keep, ghost });
  tools = new Tools({ scene, camera, canvas, builder, renditions, ground, placed, things, library, caves, layout, inEarth: ghost });
  // The bottom bar's display toggles.
  $("showGrid").checked = grid.value === 1;
  $("showGrid").addEventListener("change", () => (grid.value = $("showGrid").checked ? 1 : 0));
  // Curtains are a way of showing lines, so only when they're shown.
  const showLines = () => {
    $("showCurtains").disabled = !$("showLines").checked;
    tools.marks.showAs($("showLines").checked, $("showCurtains").checked);
  };
  $("showLines").addEventListener("change", showLines);
  $("showCurtains").addEventListener("change", showLines);
  // Showing biomes outlines their areas and tints the ground but that drawn in full.
  const TINT = BIOME_NAMES.map((name) => new THREE.Color(BIOMES[name]).toArray());
  $("showBiomes").addEventListener("change", () => {
    tools.showBiomes($("showBiomes").checked);
    ground.setTint($("showBiomes").checked ? TINT : null);
  });
  $("showPins").addEventListener("change", () => tools.marks.pins.setShown($("showPins").checked));
  // The debug toggles each show their part of the debug pane, and the pane while any's on.
  const debugToggles = [...document.querySelectorAll("[data-show-debug]")];
  const debugShown = (part) => debugToggles.some((t) => t.checked && (!part || t.dataset.showDebug === part));
  const showDebug = () => {
    for (const toggle of debugToggles) document.querySelector(`[data-debug="${toggle.dataset.showDebug}"]`).hidden = !toggle.checked;
    $("debug").hidden = !debugShown();
  };
  for (const toggle of debugToggles) toggle.addEventListener("change", showDebug);
  // The browser may have kept them checked from before the page was loaded again.
  showDebug();
  showLines();
  // Let go of the toggle clicked, so keys go back to flying and the tools.
  $("bottom").addEventListener("change", (e) => e.target.blur());
  const planning = world.files.get(planningPath(continent));
  if (planning) tools.marks.load(JSON.parse(strFromU8(planning)));
  const biomes = world.files.get(biomesPath(continent));
  if (biomes) tools.biomes.load(JSON.parse(strFromU8(biomes)));
  // Plate files are baked with the biomes, again where they change.
  renditions.setBiomes(tools.biomes.toJSON().areas, false);
  let biomesBaked = tools.biomes.version;
  // And with the water's bodies.
  const water = world.files.get(waterPath(continent));
  if (water) {
    tools.water.load(JSON.parse(strFromU8(water)));
    tools.courses.load(JSON.parse(strFromU8(water)));
  }
  // What the water file has: the bodies and courses.
  const waterFile = () => ({ version: 1, bodies: tools.water.toJSON().bodies, courses: tools.courses.toJSON().courses, ripple: tools.courses.ripple });
  const waterVersion = () => `${tools.water.version},${tools.courses.version}`;
  renditions.setWater(waterFile(), false);
  let waterBaked = waterVersion();

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  let last = null;
  const FPS = 30;
  let lastSave = 0;
  let lastHud = 0;
  let [saving, lastChangeSave, marksSaved, biomesSaved, waterSaved, layoutSaved] = [null, 0, 0, 0, "0,0", layout.dropped ? -1 : layout.version];
  const unsaved = () => renditions.unsaved.size || placed.changed.size || library.dirty.size || caves.changed.size || tools.marks.version !== marksSaved || tools.biomes.version !== biomesSaved || waterVersion() !== waterSaved || layout.version !== layoutSaved;
  // Saves what's changed into `changes`, writing files on the worker: once what's being saved is,
  // where something is.
  const save = async () => {
    while (saving) await saving;
    if (!unsaved()) return;
    const [version, biomesVersion, waterNow, layoutNow] = [tools.marks.version, tools.biomes.version, waterVersion(), layout.version];
    saving = renditions
      .unsavedFiles(continent)
      .then(async (files) => {
        for (const [path, bytes] of [...files, ...placed.unsavedFiles(continent), ...caves.unsavedFiles(continent), ...library.unsavedFiles()]) changes.set(path, bytes);
        changes.set(planningPath(continent), strToU8(`${JSON.stringify(tools.marks.toJSON())}\n`));
        changes.set(biomesPath(continent), strToU8(`${JSON.stringify(tools.biomes.toJSON())}\n`));
        changes.set(waterPath(continent), strToU8(`${JSON.stringify(waterFile())}\n`));
        if (layout.networks.size || layout.carved.size || layoutBytes) changes.set(layoutPath(continent), strToU8(`${JSON.stringify(layout.toJSON())}\n`));
        await store.set("changes", changes);
        [marksSaved, biomesSaved, waterSaved, layoutSaved] = [version, biomesVersion, waterNow, layoutNow];
      })
      .catch((e) => console.error("couldn't save the changes", e))
      .finally(() => {
        saving = null;
        lastChangeSave = performance.now();
      });
    await saving;
  };
  const downloadButton = $("downloadWorld");
  downloadButton.addEventListener("click", async () => {
    if (downloadButton.disabled) return;
    [downloadButton.disabled, downloadButton.textContent] = [true, "downloading…"];
    try {
      await download(world, changes, save);
    } catch (e) {
      console.error("couldn't download the world", e);
    } finally {
      [downloadButton.disabled, downloadButton.textContent] = [false, "download world"];
    }
  });
  repoTools(world, changes, save);
  let lastInfo = 0;
  const compass = new Compass($("stage"), document.querySelector(".create-bar"));
  const feet = (ft) => `${Math.round(ft).toLocaleString()} ft`;
  const toward = (ft, ahead, back) => `${feet(Math.abs(ft))} ${ft < 0 ? back : ahead}`;
  // The spawn point, kept in world.json: where characters new to the world start.
  const worldInfo = () => JSON.parse(strFromU8(changes.get("world.json") ?? world.files.get("world.json")));
  const showSpawn = () => {
    const { spawn } = worldInfo();
    $("spawnAt").textContent = spawn ? `${toward(spawn.at[0], "east", "west")}, ${toward(spawn.at[1], "south", "north")}` : "none yet: the game won't take the world without one";
    $("spawnGo").disabled = !spawn;
  };
  showSpawn();
  $("spawnHere").addEventListener("click", async () => {
    const info = worldInfo();
    info.spawn = { continent, at: [builder.state.x, builder.state.z].map((v) => Math.round(v * 10) / 10) };
    changes.set("world.json", strToU8(`${JSON.stringify(info, null, 2)}\n`));
    await store.set("changes", changes).catch(() => {});
    showSpawn();
  });
  $("spawnGo").addEventListener("click", () => {
    const [x, z] = worldInfo().spawn.at;
    builder.state = { ...builder.state, x, z, y: walkAt(x, z), flying: false, falling: 0 };
  });
  let frames = 0;
  let problem = null; // why the ground couldn't be drawn, shown in the HUD
  // The slowest of each part of a frame since the HUD last showed them, in ms, and of the gaps
  // between frames.
  let worst = { gap: 0, move: 0, tool: 0, ground: 0, render: 0 };
  const timed = (part, fn) => {
    const start = performance.now();
    fn();
    worst[part] = Math.max(worst[part], performance.now() - start);
  };
  // A handle for measuring from the browser's console or a script; paused stops the frames.
  store
    .get(clipboardKey)
    .then((template) => template && !library.clipboard && tools.build.setClipboard(template, false))
    .catch(() => {});
  (fresh ? sync.replace(library) : sync.pull().then((changed) => changed && (library.register(), tools.build.showRecent()))).catch(() => {});
  window.create = { placed, things, library, caves, ground, scatter, clutter, falls, surfaces, builder, tools, renderer, scene, camera, paused: false };
  const frame = (now) => {
    if (window.create.paused) return requestAnimationFrame(frame);
    // At most FPS frames a second, with a little slack so a 60 Hz screen draws every other frame.
    if (last !== null && now - last < 1000 / FPS - 2) return requestAnimationFrame(frame);
    const dt = last === null ? 0 : Math.min(0.05, (now - last) / 1000);
    if (last !== null) worst.gap = Math.max(worst.gap, now - last);
    last = now;
    frames++;
    timed("move", () => builder.tick(dt));
    timed("tool", () => tools.tick(dt));
    const { x, y, z } = builder.state;
    timed("ground", () => {
      try {
        ground.update(x, y, z);
        problem = null;
      } catch (e) {
        problem = e.message;
        console.error(e);
      }
    });
    sea.tick(x, SEA_LEVEL_FT - SEA_BELOW_FT, z);
    timed("ground", () => scatter.tick(dt, x, z, ground.finest <= FINE));
    timed("ground", () => clutter.tick(dt, x, z, ground.finest <= FINE));
    timed("ground", () => falls.tick(dt, x, z));
    if (placed.version !== pressedVersion) {
      pressedVersion = placed.version;
      timed("ground", () => ground.refresh(renditions.repress()));
    }
    timed("ground", () => things.tick(x, z));
    timed("ground", () => caves.tick(x, z));
    timed("ground", () => surfaces.tick(dt, x, z, ground.finest <= FINE));
    // The ground drawn ends ground.reach across from the builder, so fog closes in there, as far
    // off as that is from the camera, high up too. High up, the camera's near plane's further
    // off, to keep the far ground from flickering.
    const back = Math.hypot(camera.position.x - x, camera.position.z - z);
    const high = Math.max(0, camera.position.y - (groundAt(x, z) ?? SEA_LEVEL_FT));
    scene.fog.near = Math.hypot(ground.reach * FOG.near + back, high);
    scene.fog.far = Math.hypot(ground.reach * FOG.far + back, high);
    const near = Math.min(NEAR_MOST_FT, Math.max(NEAR_FT, high * NEAR_PER_FT));
    if (Math.abs(camera.near - near) > near * 0.1) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
    // Under water, murky, close in.
    const surface = waterAt(camera.position.x, camera.position.z);
    const under = surface != null && camera.position.y < surface;
    // Under the ground, but where a cave opens over the camera, dark, the ground drawn as lines,
    // and nothing on it.
    const [cx, cz] = [camera.position.x, camera.position.z];
    const buried = camera.position.y < groundAt(cx, cz) && !caves.mouth(Math.floor(cx / VOXEL_FT), Math.floor(cz / VOXEL_FT));
    ground.group.visible = !buried;
    caves.groundGroup.visible = !buried;
    // In the rock, the caves' outlines show.
    caves.show("lines", buried && caves.solid(cx, camera.position.y, cz));
    caves.fromEarth(ghost());
    timed("ground", () => overhead.tick(buried, x, z, now - lastOverhead > OVERHEAD_EVERY_MS && (lastOverhead = now)));
    earth.tick(camera, ghost());
    for (const shown of [sea.mesh, falls.group]) shown.visible = !buried;
    // In a cave, what's placed in it shows; the rock hides what's on the ground over it.
    const inCave = buried && !caves.solid(cx, camera.position.y, cz);
    for (const shown of [things.group, things.outlines]) shown.visible = !buried || inCave;
    if (buried) for (const shown of [scatter.group, clutter.group, surfaces.group]) shown.visible = false;
    const sky = buried ? UNDERGROUND : under ? UNDERWATER.color : SKY;
    scene.fog.color.set(sky);
    scene.background.set(sky);
    if (under) [scene.fog.near, scene.fog.far] = [UNDERWATER.nearFt, UNDERWATER.farFt];
    sun.position.set(x + 500, 1000, z + 300);
    sun.target.position.set(x, 0, z);
    compass.tick(camera);
    timed("render", () => renderer.render(scene, camera));
    if (now - lastInfo > INFO_EVERY_MS) {
      // A cave's rock, from in one, or else the ground.
      const at = tools.caveHit()?.at ?? tools.hit();
      // From the builder's feet, not the camera behind them.
      $("infoPoint").textContent = at ? feet(Math.hypot(at[0] - x, at[1] - y, at[2] - z)) : "-";
      $("infoHoriz").textContent = at ? feet(Math.hypot(at[0] - x, at[2] - z)) : "-";
      $("infoSpot").textContent = at ? at.map((v) => Math.round(v)).join(", ") : "-";
      $("infoHeight").textContent = feet(y - SEA_LEVEL_FT);
      $("infoGround").textContent = feet(renditions.heightAt(x, z) ?? EMPTY_FT);
      $("infoFacing").textContent = facing(builder.state.yaw);
      lastInfo = now;
    }
    if (now - lastHud > HUD_EVERY_MS) {
      const { flying, swimming } = builder.state;
      $("hud").classList.toggle("problem", Boolean(problem));
      $("hud").textContent = problem ? `can't draw the ground: ${problem}` : "";
      if (debugShown("frame")) {
        $("debugFps").textContent = String(Math.round((frames * 1000) / (now - lastHud)));
        $("debugSlowest").textContent = `${worst.gap.toFixed(0)} ms`;
        for (const [id, part] of [["debugMove", "move"], ["debugTool", "tool"], ["debugGround", "ground"], ["debugRender", "render"]]) $(id).textContent = `${worst[part].toFixed(1)} ms`;
        $("debugDraws").textContent = String(renderer.info.render.calls);
      }
      if (debugShown("ground")) {
        ["debugFull", "debugFine", "debugCoarse", "debugPlates"].forEach((id, k) => ($(id).textContent = ground.counts[k].toLocaleString()));
        $("debugReach").textContent = `${(ground.reach / 5280).toFixed(1)} mi`;
        const hidden = KINDS.filter((kind) => !ground.shown[kind]);
        $("debugHidden").textContent = hidden.length ? hidden.join(", ") : "-";
      }
      if (debugShown("builder")) {
        $("debugMoving").textContent = flying ? "flying" : swimming ? "swimming" : "walking";
        $("debugAbove").textContent = feet(builder.above);
        $("debugTile").textContent = `${Math.floor(x / TILE_FT)}, ${Math.floor(z / TILE_FT)}`;
        $("debugPlate").textContent = `${Math.floor(x / PLATE_FT)}, ${Math.floor(z / PLATE_FT)}`;
      }
      worst = { gap: 0, move: 0, tool: 0, ground: 0, render: 0 };
      lastHud = now;
      frames = 0;
    }
    if (tools.biomes.version !== biomesBaked && !tools.biomes.dragging) {
      renditions.setBiomes(tools.biomes.toJSON().areas);
      biomesBaked = tools.biomes.version;
      ground.retint();
    }
    if (waterVersion() !== waterBaked && !tools.water.dragging && !tools.courses.dragging && !tools.courses.draft) {
      ground.refresh(renditions.setWater(waterFile()));
      waterBaked = waterVersion();
    }
    // Saves what's changed once there's been time to finish the stroke.
    if (!saving && !tools.stroke && !tools.drawing && now - lastChangeSave > SAVE_CHANGES_MS && unsaved()) save();
    if (now - lastSave > SAVE_EVERY_MS) {
      try {
        localStorage.setItem(placeKey, JSON.stringify(builder.state));
      } catch {}
      lastSave = now;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function open(base, changes = new Map(), fresh = false) {
  try {
    start(readWorld(base, changes), changes, fresh);
    showing = true;
    return true;
  } catch (e) {
    $("openError").textContent = e.message;
    return false;
  }
}

// GitHub, in the manage tools: the repo the world came from, saving to it as one commit, and
// publishing that commit as the next version.
function repoTools(world, changes, save) {
  const status = (text) => ($("repoStatus").textContent = text);
  const buttons = [$("repoSave"), $("repoPublish")];
  let busy = false;
  const show = () => {
    $("repoSource").textContent = source ? `${source.repo}, ${source.branch} at ${source.commitSha?.slice(0, 7) ?? "no commits yet"}` : "not kept in a repo";
    for (const button of buttons) button.disabled = busy || !source;
  };
  show();
  const run = async (doing, act) => {
    if (busy || !source) return;
    busy = true;
    show();
    try {
      await save();
      await act(new GithubClient(source.repo));
    } catch (e) {
      console.error(`couldn't ${doing}`, e);
      if (e instanceof BranchMoved) status(`${e.message}: download the world to keep your changes, then open the repo again.`);
      else if (e instanceof GithubAuthError) status("Connect GitHub first, from your worlds page.");
      else status(`Couldn't ${doing}: ${e.message}`);
    } finally {
      busy = false;
      show();
    }
  };
  $("repoSave").addEventListener("click", () =>
    run("save", async (client) => {
      const files = withChanges(world.files, changes);
      const message = $("repoMessage").value.trim() || "Save from /create";
      const next = await saveRepo(client, files, source, { message, log: status, onProgress: ({ done, total }) => status(`Sending ${done} of ${total} files…`) });
      if (!next) return status("Nothing's changed since the last save.");
      // What was committed is the world's files now; what changed meanwhile stays a change.
      for (const [path, bytes] of [...changes]) if (bytes === null ? !files.has(path) : files.get(path) === bytes) changes.delete(path);
      for (const path of [...world.files.keys()]) if (!files.has(path)) world.files.delete(path);
      for (const [path, bytes] of files) world.files.set(path, bytes);
      source = next;
      await store.set("world", files);
      await store.set("changes", changes);
      await store.set("source", source);
      $("repoMessage").value = "";
      status(`Saved ${next.commitSha.slice(0, 7)}.`);
    }),
  );
  $("repoPublish").addEventListener("click", () =>
    run("publish", async (client) => {
      if (!source.commitSha || Object.keys((await repoChanges(withChanges(world.files, changes), source)).changes).length) return status("Save to GitHub first: publishing tags the saved commit.");
      const tags = await client.tags();
      const already = tags.find((tag) => tag.sha === source.commitSha);
      if (already) return status(`${source.commitSha.slice(0, 7)} is published already, as ${already.name}.`);
      const name = nextVersion(tags);
      if (!window.confirm(`Publish ${source.commitSha.slice(0, 7)} as ${name}?`)) return;
      await client.createTag(name, source.commitSha);
      status(`Published ${name}.`);
    }),
  );
}

// Opening a repo, from the manage tools or the open screen, goes to its address, which opens it.
for (const form of [$("repoOpen"), $("openRepo")]) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const repo = form.querySelector("input").value.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$|\/$/g, "");
    if (fromRepo(`github/${repo}`)) window.location.search = `?from=github/${repo}`;
    else $(form.id === "openRepo" ? "openError" : "repoStatus").textContent = "Give the repo as owner/name.";
  });
}

// The files at the head of `repo`, kept in place of the world kept here, or null when that's the
// one to open: it's that commit already, or you'd rather keep its changes. Throws when it can't.
async function openRepo(repo, kept, keptChanges) {
  const client = new GithubClient(repo);
  $("open").hidden = false;
  $("openError").textContent = `Opening ${repo}…`;
  const head = await client.headSha(await client.defaultBranch());
  if (kept && sameRepo(source?.repo, repo) && source.commitSha === head) return null;
  const lose = source && !sameRepo(source.repo, repo) ? `${source.repo}'s` : "its";
  if (kept && keptChanges?.size && !window.confirm(`Open ${repo} from GitHub? It replaces the world kept in this browser, and ${lose} changes are lost unless you've saved or downloaded them.`)) return null;
  const sameKept = kept instanceof Map && sameRepo(source?.repo, repo) ? { files: kept, source } : null;
  const loaded = await loadRepo(client, { kept: sameKept, onProgress: ({ done, total }) => ($("openError").textContent = `Downloading ${done} of ${total} files…`) });
  const { name } = readWorld(loaded.files);
  await keepNew(loaded.files, false, loaded.source);
  source = loaded.source;
  recordOpened(repo, name).catch((e) => console.error("couldn't add the world to your list", e));
  return loaded.files;
}

// A world opened while another's showing replaces it: kept, then the page loads again with it,
// at /create alone, not a repo's address.
let showing = false;
const openKept = () => window.location.assign(window.location.pathname);
$("openFile").addEventListener("change", async () => {
  const file = $("openFile").files[0];
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (showing || source) {
    if (!window.confirm(`Open ${file.name}? It replaces the world kept in this browser, which is lost unless you've downloaded or saved it.`)) return;
    try {
      readWorld(bytes);
    } catch (e) {
      $("openError").textContent = e.message;
      return;
    }
    await keepNew(bytes, true);
    openKept();
    return;
  }
  if (await open(bytes, new Map(), true)) await keepNew(bytes);
});
// Starts an empty world in place of the one showing, after asking, since that's lost unless it's
// been downloaded or saved.
$("newWorld").addEventListener("click", async () => {
  if (showing && !window.confirm("Start a new, empty world? This one's lost unless you've downloaded or saved it.")) return;
  const info = { version: 2, name: "New world", continents: [{ key: "main", name: "Main" }], dungeons: [] };
  const bytes = zipSync({ "world.json": strToU8(`${JSON.stringify(info, null, 2)}\n`) });
  try {
    localStorage.removeItem(`create:${info.name}:main`);
  } catch {}
  if (showing) {
    await keepNew(bytes, true);
    openKept();
  } else if (await open(bytes, new Map(), true)) await keepNew(bytes);
});
$("openWorld").addEventListener("click", () => {
  $("openError").textContent = "";
  $("openFile").value = "";
  $("openFile").click();
});

// Keeps a world just opened or made, in place of the one kept: a zip's bytes, or a repo's files
// with their source. `fresh` is for opening it on the reload to come.
async function keepNew(base, fresh = false, from = null) {
  await store.set("world", base).catch(() => {});
  await store.delete("changes");
  if (from) await store.set("source", from).catch(() => {});
  else await store.delete("source");
  if (fresh) await store.set("fresh", true).catch(() => {});
}

const kept = await store.get("world").catch(() => null);
const changes = await store.get("changes").catch(() => null);
let source = await store.get("source").catch(() => null);
const fresh = !!(await store.get("fresh").catch(() => null));
await store.delete("fresh");
const repo = fromRepo(new URLSearchParams(window.location.search).get("from"));
let [opened, failed] = [null, false];
try {
  opened = repo && (await openRepo(repo, kept, changes));
  $("openError").textContent = "";
} catch (e) {
  failed = true;
  console.error(`couldn't open ${repo}`, e);
  $("openError").textContent = e instanceof GithubAuthError ? "Connect GitHub first, from your worlds page." : `Couldn't open ${repo}: ${e.message}`;
  $("openKept").hidden = !kept;
}
if (opened) await open(opened, new Map(), true);
else if (!failed && (!kept || !(await open(kept, changes ?? new Map(), fresh)))) $("open").hidden = false;
