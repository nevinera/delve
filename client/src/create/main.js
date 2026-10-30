import "./create.css";
import * as THREE from "three";
import { strFromU8, unzipSync } from "fflate";
import { PLATTER_PATH } from "../v2/platter.js";
import { SEA_LEVEL_FT, TILE_FT } from "../v2/sizes.js";
import { Builder } from "./builder.js";
import { Ground, RADIUS_FT, Renditions } from "./ground.js";

// /create: the new editor, so far a builder walking and flying over a version 2 world's ground.
// The world comes from a zip you open (script/convert-v2.mjs makes one from a v1 world), kept in
// this browser so a reload opens it again, with the builder where they were.

const $ = (id) => document.getElementById(id);
const SKY = 0x9cc4e4;
const FOG = { nearFt: RADIUS_FT * 0.6, farFt: RADIUS_FT * 1.05 };
const SAVE_EVERY_MS = 2000;
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
  for (const [path, b] of files) if (PLATTER_PATH.exec(path)?.[1] === continent) renditions.add(b);
  return { name: info.name, continent, renditions };
}

function start({ name, continent, renditions }) {
  $("open").hidden = true;
  $("worldName").textContent = name;
  const canvas = $("view");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, FOG.nearFt, FOG.farFt);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 100000);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x55503c, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.8);
  sun.position.set(0.5, 1, 0.3);
  scene.add(sun, sun.target);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(RADIUS_FT * 4, RADIUS_FT * 4), new THREE.MeshLambertMaterial({ color: 0x2f6f9f, transparent: true, opacity: 0.8 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_LEVEL_FT;
  scene.add(sea);
  const ground = new Ground(scene, renditions);
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
    const { x, z } = builder.state;
    ground.update(x, z);
    sea.position.set(x, SEA_LEVEL_FT, z);
    // The ground drawn ends RADIUS_FT from the builder, so fog closes in there, however far up the
    // camera is.
    const below = camera.position.y - (groundAt(camera.position.x, camera.position.z) ?? SEA_LEVEL_FT);
    const edge = Math.hypot(Math.max(0, below), RADIUS_FT) + camera.position.distanceTo(builder.model.position);
    scene.fog.near = edge * (FOG.nearFt / RADIUS_FT);
    scene.fog.far = edge * (FOG.farFt / RADIUS_FT);
    sun.position.set(x + 500, 1000, z + 300);
    sun.target.position.set(x, 0, z);
    renderer.render(scene, camera);
    if (now - lastHud > HUD_EVERY_MS) {
      const { y, flying } = builder.state;
      const fps = Math.round((frames * 1000) / (now - lastHud));
      $("hud").textContent = `${flying ? "flying" : "walking"} · ${Math.round(builder.above)} ft up · ${Math.round(y)} ft · tile ${Math.floor(x / TILE_FT)},${Math.floor(z / TILE_FT)} · ${ground.meshes.size} tiles drawn · ${fps} fps`;
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
    return true;
  } catch (e) {
    $("openError").textContent = e.message;
    return false;
  }
}

$("openFile").addEventListener("change", async () => {
  const file = $("openFile").files[0];
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (await open(bytes)) await store.set("world", bytes).catch(() => {});
});

const kept = await store.get("world").catch(() => null);
if (!kept || !(await open(kept))) $("open").hidden = false;
