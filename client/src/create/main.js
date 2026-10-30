import "./create.css";
import * as THREE from "three";
import { strFromU8, unzipSync } from "fflate";
import { PLATE_PATH } from "../v2/plate.js";
import { PLATTER_PATH } from "../v2/platter.js";
import { SEA_LEVEL_FT, TILE_FT } from "../v2/sizes.js";
import { Builder } from "./builder.js";
import { FAR_FT, Ground, Renditions } from "./ground.js";

// /create: the new editor, so far a builder walking and flying over a version 2 world's ground.
// The world comes from a zip you open (script/convert-v2.mjs makes one from a v1 world), kept in
// this browser so a reload opens it again, with the builder where they were. Opening another
// replaces it.

const $ = (id) => document.getElementById(id);
const SKY = 0x9cc4e4;
const FOG = { nearFt: FAR_FT * 0.5, farFt: FAR_FT * 1.02 };
const SAVE_EVERY_MS = 2000;
const SEA_BELOW_FT = 2;
const HUD_EVERY_MS = 250;

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

// A v2 world's name and its first continent's renditions, from the zip's bytes.
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
  return { name: info.name, continent, renditions };
}

function start({ name, continent, renditions }) {
  $("open").hidden = true;
  $("worldName").textContent = name;
  const canvas = $("view");
  // A logarithmic depth buffer, so ground miles off doesn't flicker where faces nearly meet.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
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
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(FAR_FT * 2.2, FAR_FT * 2.2), new THREE.MeshLambertMaterial({ color: 0x2e608c }));
  sea.rotation.x = -Math.PI / 2;
  scene.add(sea);
  const ground = new Ground(scene, renditions, renderer);
  const groundAt = (x, z) => renditions.heightAt(x, z);
  const placeKey = `create:${name}:${continent}`;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(placeKey));
  } catch {}
  const builder = new Builder({ scene, camera, canvas, groundAt, at: renditions.middle(), state: saved ?? undefined });

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  let last = null;
  let lastSave = 0;
  let lastHud = 0;
  let frames = 0;
  const frame = (now) => {
    const dt = last === null ? 0 : Math.min(0.05, (now - last) / 1000);
    last = now;
    frames++;
    builder.tick(dt);
    const { x, y, z } = builder.state;
    ground.update(x, y, z);
    sea.position.set(x, SEA_LEVEL_FT - SEA_BELOW_FT, z);
    // The ground drawn ends FAR_FT from the builder, so fog closes in there.
    const back = camera.position.distanceTo(builder.model.position);
    scene.fog.near = FOG.nearFt + back;
    scene.fog.far = FOG.farFt + back;
    sun.position.set(x + 500, 1000, z + 300);
    sun.target.position.set(x, 0, z);
    renderer.render(scene, camera);
    if (now - lastHud > HUD_EVERY_MS) {
      const { flying } = builder.state;
      const fps = Math.round((frames * 1000) / (now - lastHud));
      $("hud").textContent = `${flying ? "flying" : "walking"} · ${Math.round(builder.above)} ft up · ${Math.round(y)} ft · tile ${Math.floor(x / TILE_FT)},${Math.floor(z / TILE_FT)} · ${ground.fullChunks} full and ${ground.fineChunks} cell chunks, ${ground.meshes.size} tiles and ${ground.plates.size} plates drawn · ${fps} fps`;
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
$("openWorld").addEventListener("click", () => {
  $("openError").textContent = "";
  $("openFile").value = "";
  $("openFile").click();
});

const kept = await store.get("world").catch(() => null);
if (!kept || !(await open(kept))) $("open").hidden = false;
