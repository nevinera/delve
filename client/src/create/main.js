import "./create.css";
import * as THREE from "three";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { PLATE_PATH, decodePlate } from "../v2/plate.js";
import { PLATTER_PATH } from "../v2/platter.js";
import { CHUNK_FT, PLATE_FT, SEA_LEVEL_FT, TILE_FT } from "../v2/sizes.js";
import { Builder } from "./builder.js";
import { Compass, facing } from "./compass.js";
import { EMPTY_FT, FAR_FT, Ground, Renditions } from "./ground.js";
import { grid, withGrid } from "./grid.js";
import { planningPath } from "./marks.js";
import { Tools } from "./tools.js";

// /create: the new editor, so far a builder walking and flying over a version 2 world's ground.
// The world comes from a zip you upload (script/convert-v2.mjs makes one from a v1 world), kept in
// this browser so a reload opens it again, with the builder where they were. Uploading another
// replaces it. Downloading it gives a zip of it with the ground as it's been moved. A new world has
// nothing in it: no tiles, all sea.

const $ = (id) => document.getElementById(id);
const SKY = 0x9cc4e4;
const FOG = { nearFt: FAR_FT * 0.5, farFt: FAR_FT * 1.02 };
const SAVE_EVERY_MS = 2000;
const SEA_BELOW_FT = 2;
const HUD_EVERY_MS = 250;
const INFO_EVERY_MS = 100;

// The zip opened last, kept in IndexedDB.
const store = {
  db: () =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open("create", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("files");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    }),
  async get(key) {
    const db = await this.db();
    return new Promise((resolve) => {
      const req = db.transaction("files").objectStore("files").get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  },
  async set(key, value) {
    const db = await this.db();
    db.transaction("files", "readwrite").objectStore("files").put(value, key);
  },
};

// A v2 world's name, its files (path -> bytes) and its first continent's renditions, from the zip's
// bytes.
function readWorld(bytes) {
  let files = Object.entries(unzipSync(bytes));
  if (!files.some(([path]) => path === "world.json")) {
    const top = files[0][0].split("/")[0];
    files = files.map(([path, b]) => [path.slice(top.length + 1), b]);
  }
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

// Saves the world as a zip, its moved ground in. Its files are gzipped already, so the zip stores
// them as they are.
function download({ name, files, continent, renditions }, planning) {
  const out = new Map(files);
  out.set(planningPath(continent), strToU8(`${JSON.stringify(planning)}\n`));
  for (const [path, bytes] of renditions.changedFiles(continent)) out.set(path, bytes);
  const zip = zipSync(Object.fromEntries([...out].map(([path, bytes]) => [path, [bytes, { level: 0 }]])));
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
  link.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase() || "world"}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

function start(world) {
  const { name, continent, renditions } = world;
  $("downloadWorld").addEventListener("click", () => download(world, tools.marks.toJSON()));
  $("open").hidden = true;
  $("worldName").textContent = name;
  const canvas = $("view");
  // A logarithmic depth buffer, so ground miles off doesn't flicker where faces nearly meet.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  // A pixel a CSS pixel, even on high-density screens: the editor needn't be crisp.
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, FOG.nearFt, FOG.farFt);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 100000);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x55503c, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.8);
  sun.position.set(0.5, 1, 0.3);
  scene.add(sun, sun.target);
  // The open sea, a little under sea level, showing where no ground's drawn. Renditions draw the
  // water over tiles themselves.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(FAR_FT * 2.2, FAR_FT * 2.2), withGrid(new THREE.MeshLambertMaterial({ color: 0x2e608c }), CHUNK_FT));
  sea.rotation.x = -Math.PI / 2;
  scene.add(sea);
  const ground = new Ground(scene, renditions, renderer);
  // The builder stands on the sea where it's over the ground.
  const groundAt = (x, z) => Math.max(renditions.heightAt(x, z) ?? EMPTY_FT, SEA_LEVEL_FT);
  const placeKey = `create:${name}:${continent}`;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(placeKey));
  } catch {}
  // 1 to 4 show or hide each kind of ground, finest first, and g the grid.
  const KINDS = ["full", "fine", "tile", "plate"];
  window.addEventListener("keydown", (e) => {
    if (e.target.matches?.("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const kind = KINDS[Number(e.key) - 1];
    if (kind) ground.toggle(kind);
    if (e.key.toLowerCase() === "g") grid.value = 1 - grid.value;
  });
  // The middling height of the plate at (x, z), from its rendition's corners.
  const baseAt = (x, z) => {
    const plate = renditions.plate(Math.floor(x / PLATE_FT), Math.floor(z / PLATE_FT));
    return plate ? plate.heights.reduce((sum, h) => sum + h, 0) / plate.heights.length : null;
  };
  const builder = new Builder({ scene, camera, canvas, groundAt, baseAt, at: renditions.middle(), state: saved ?? undefined });
  const tools = new Tools({ scene, camera, canvas, builder, renditions, ground });
  const planning = world.files.get(planningPath(continent));
  if (planning) tools.marks.load(JSON.parse(strFromU8(planning)));

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
  let lastInfo = 0;
  const compass = new Compass(scene);
  const feet = (ft) => `${Math.round(ft).toLocaleString()} ft`;
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
  window.create = { ground, builder, tools, renderer, scene, camera, paused: false };
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
    sea.position.set(x, SEA_LEVEL_FT - SEA_BELOW_FT, z);
    // The ground drawn ends FAR_FT across from the builder, so fog closes in there, as far off
    // as that is from the camera, high up too.
    const back = Math.hypot(camera.position.x - x, camera.position.z - z);
    const high = Math.max(0, camera.position.y - (groundAt(x, z) ?? SEA_LEVEL_FT));
    scene.fog.near = Math.hypot(FOG.nearFt + back, high);
    scene.fog.far = Math.hypot(FOG.farFt + back, high);
    sun.position.set(x + 500, 1000, z + 300);
    sun.target.position.set(x, 0, z);
    compass.tick(camera);
    timed("render", () => renderer.render(scene, camera));
    if (now - lastInfo > INFO_EVERY_MS) {
      const at = tools.hit();
      $("infoPoint").textContent = at ? feet(camera.position.distanceTo(new THREE.Vector3(...at))) : "-";
      $("infoHeight").textContent = feet(y - SEA_LEVEL_FT);
      $("infoGround").textContent = feet(renditions.heightAt(x, z) ?? EMPTY_FT);
      $("infoFacing").textContent = facing(builder.state.yaw);
      lastInfo = now;
    }
    if (now - lastHud > HUD_EVERY_MS) {
      const { flying } = builder.state;
      const fps = Math.round((frames * 1000) / (now - lastHud));
      $("hud").classList.toggle("problem", Boolean(problem));
      const hidden = KINDS.filter((kind) => !ground.shown[kind]);
      $("hud").textContent = problem ? `can't draw the ground: ${problem}` : `${hidden.length ? `hiding ${hidden.join(", ")} · ` : ""}${flying ? "flying" : "walking"} · ${Math.round(builder.above)} ft up · ${Math.round(y)} ft · tile ${Math.floor(x / TILE_FT)},${Math.floor(z / TILE_FT)} · tiles drawn ${ground.counts[0]} in full, ${ground.counts[1]} at cell scale, ${ground.counts[2]} coarse, ${ground.counts[3]} from plates · ${fps} fps, slowest ${worst.gap.toFixed(0)} ms (move ${worst.move.toFixed(1)}, tool ${worst.tool.toFixed(1)}, ground ${worst.ground.toFixed(1)}, render ${worst.render.toFixed(1)}) · ${renderer.info.render.calls} draws`;
      worst = { gap: 0, move: 0, tool: 0, ground: 0, render: 0 };
      lastHud = now;
      frames = 0;
    }
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

async function open(bytes) {
  try {
    start(readWorld(bytes));
    showing = true;
    return true;
  } catch (e) {
    $("openError").textContent = e.message;
    return false;
  }
}

// A world opened while another's showing replaces it: kept, then the page loads again with it.
let showing = false;
$("openFile").addEventListener("change", async () => {
  const file = $("openFile").files[0];
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (showing) {
    try {
      readWorld(bytes);
    } catch (e) {
      $("openError").textContent = e.message;
      return;
    }
    await store.set("world", bytes).catch(() => {});
    window.location.reload();
    return;
  }
  if (await open(bytes)) await store.set("world", bytes).catch(() => {});
});
// Starts an empty world in place of the one showing, after asking, since moves not downloaded are
// lost.
$("newWorld").addEventListener("click", async () => {
  if (showing && !window.confirm("Start a new, empty world? Whatever you've not downloaded is lost.")) return;
  const info = { version: 2, name: "New world", continents: [{ key: "main", name: "Main" }], dungeons: [] };
  const bytes = zipSync({ "world.json": strToU8(`${JSON.stringify(info, null, 2)}\n`) });
  try {
    localStorage.removeItem(`create:${info.name}:main`);
  } catch {}
  await store.set("world", bytes).catch(() => {});
  window.location.reload();
});
$("openWorld").addEventListener("click", () => {
  $("openError").textContent = "";
  $("openFile").value = "";
  $("openFile").click();
});

const kept = await store.get("world").catch(() => null);
if (!kept || !(await open(kept))) $("open").hidden = false;
