import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TILE_FT } from "../world/constants.js";
import { surfaceTiles } from "./thumbnails.js";
import { CHUNK, fingerprint } from "./thumbPixels.js";
import { SAMPLES } from "./overviewHeights.js";

// The 3d step's view: the whole continent's ground as one coarse sheet, a vertex every 32ft, with
// the tiles' thumbnails laid over it and nothing on top. You orbit and pan over it, but can't come
// closer than about MIN_TILES tiles across, so it stays cheap. It draws only when something changes.
const MIN_TILES = 9;
const FOV = 45;
const SAMPLE_FT = TILE_FT / SAMPLES;
const SIDE = CHUNK * SAMPLES; // samples across a mesh, one mesh per thumbnail chunk
const SKY = 0xb8c8d8;
const REBUILD_MS = 300; // while heights arrive, between redrawing the meshes they land in
const ABOVE_GROUND_FT = 300; // the least the camera keeps above the ground under it
const KEY_PAN = 0.8; // of the camera's distance, per second
const KEY_ZOOM = 1.5;
const KEY_TURN = 1.5; // radians per second

export class Overview {
  // thumbs: the editor's Thumbnails; onProgress(read, total) as tiles' heights arrive.
  constructor(canvas, { thumbs, onProgress }) {
    this.canvas = canvas;
    this.thumbs = thumbs;
    this.onProgress = onProgress;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 20, 2e6);
    this.minDistance = (MIN_TILES * TILE_FT) / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.minDistance = this.minDistance;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.zoomSpeed = 1.5;
    this.controls.addEventListener("change", () => this.moved());

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(-1, 1.1, -0.7); // low from the northwest, so slopes facing away go dark
    this.scene.add(new THREE.HemisphereLight(0xdde8f4, 0x40382c, 1.1), sun);
    this.land = new THREE.Group();
    this.scene.add(this.land);

    this.heights = new Map(); // "tx,tz" -> { print, heights } (overviewHeights.js)
    this.meshes = new Map(); // "cx,cz" -> { mesh, canvas }
    this.dirty = new Set(); // "cx,cz" of meshes to redo
    this.pool = new HeightPool((key, heights) => this.arrived(key, heights));
    this.exaggeration = 1;
    this.shown = false;
    this.placed = false;
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  // Shows the continent, reading the heights of tiles that are new or changed since last time, and
  // looking at tile units [x, z] the first time.
  show(world, continent, [x, z]) {
    this.shown = true;
    if (this.continent !== continent) {
      this.continent = continent;
      this.heights.clear();
      for (const { mesh } of this.meshes.values()) dispose(mesh);
      this.meshes.clear();
      this.placed = false;
    }
    const tiles = surfaceTiles(world, continent);
    const keep = new Set();
    const read = [];
    let [minX, minZ, maxX, maxZ] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const { tx, tz, path } of tiles) {
      const key = `${tx},${tz}`;
      const gz = world.files.get(path);
      const print = fingerprint(gz);
      keep.add(key);
      [minX, minZ, maxX, maxZ] = [Math.min(minX, tx), Math.min(minZ, tz), Math.max(maxX, tx + 1), Math.max(maxZ, tz + 1)];
      if (this.heights.get(key)?.print !== print) read.push({ key, gz, print });
    }
    for (const key of this.heights.keys()) if (!keep.has(key)) this.forget(key);
    this.total = tiles.length;
    this.read = tiles.length - read.length;
    this.prints = new Map(read.map(({ key, print }) => [key, print]));
    const d2 = ({ key }) => {
      const [tx, tz] = key.split(",").map(Number);
      return (tx + 0.5 - x) ** 2 + (tz + 0.5 - z) ** 2;
    };
    this.pool.read(read.sort((a, b) => d2(a) - d2(b)));
    this.onProgress?.(this.read, this.total);

    const span = Math.max(maxX - minX, maxZ - minZ, MIN_TILES) * TILE_FT;
    this.controls.maxDistance = Math.max(this.minDistance, span * 1.2);
    if (!this.placed) {
      this.placed = true;
      this.controls.target.set(x * TILE_FT, 0, z * TILE_FT);
      const distance = Math.min(this.controls.maxDistance, this.minDistance * 2.5);
      this.camera.position.set(x * TILE_FT, distance * 0.7, z * TILE_FT + distance * 0.7);
      this.controls.update();
    }
    this.thumbsChanged();
    this.resize();
  }

  hide() {
    this.shown = false;
    this.pool.clear();
  }

  // Heights are drawn this many times as tall as they are.
  setExaggeration(times) {
    this.exaggeration = times;
    this.land.scale.y = times;
    this.moved();
  }

  // The thumbnails changed: lays them over the ground again.
  thumbsChanged() {
    for (const [key, entry] of this.meshes) {
      const [cx, cz] = key.split(",").map(Number);
      const canvas = this.thumbs.chunk(cx, cz, false) ?? null;
      if (canvas !== entry.canvas) {
        entry.mesh.material.map?.dispose();
        entry.mesh.material.map = canvas && texture(canvas);
        entry.mesh.material.color.set(canvas ? 0xffffff : 0x9a9a8a);
        entry.mesh.material.needsUpdate = true;
        entry.canvas = canvas;
      } else if (canvas) entry.mesh.material.map.needsUpdate = true;
    }
    this.render();
  }

  // Held-key moves from keyNav.js: x and z pan over the ground as the camera faces, zoom closes in
  // and turn swings round the point looked at.
  nudge(dt, { x, z, zoom, turn }) {
    const { target } = this.controls;
    const offset = this.camera.position.clone().sub(target);
    const distance = offset.length();
    const forward = new THREE.Vector3(-offset.x, 0, -offset.z).normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const pan = forward.multiplyScalar(-z).add(right.multiplyScalar(x)).multiplyScalar(distance * KEY_PAN * dt);
    target.add(pan);
    if (turn) offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * KEY_TURN * dt);
    if (zoom) offset.multiplyScalar(THREE.MathUtils.clamp(distance * Math.exp(-zoom * KEY_ZOOM * dt), this.controls.minDistance, this.controls.maxDistance) / distance);
    this.camera.position.copy(target).add(offset);
    this.controls.update();
  }

  // --- heights ---

  arrived(key, heights) {
    if (!this.prints?.has(key)) return;
    this.heights.set(key, { print: this.prints.get(key), heights });
    this.prints.delete(key);
    this.read++;
    this.touch(key);
    this.onProgress?.(this.read, this.total);
    if (!this.rebuildTimer) this.rebuildTimer = setTimeout(() => this.rebuild(), this.prints.size ? REBUILD_MS : 0);
  }

  forget(key) {
    this.heights.delete(key);
    this.touch(key);
    if (!this.rebuildTimer) this.rebuildTimer = setTimeout(() => this.rebuild(), 0);
  }

  // Marks the meshes a tile's samples are in: its chunk's, and the ones west and north of it that
  // reach one sample into it.
  touch(key) {
    const [tx, tz] = key.split(",").map(Number);
    const [cx, cz] = [Math.floor(tx / CHUNK), Math.floor(tz / CHUNK)];
    const [west, north] = [tx === cx * CHUNK, tz === cz * CHUNK];
    this.dirty.add(`${cx},${cz}`);
    if (west) this.dirty.add(`${cx - 1},${cz}`);
    if (north) this.dirty.add(`${cx},${cz - 1}`);
    if (west && north) this.dirty.add(`${cx - 1},${cz - 1}`);
  }

  rebuild() {
    this.rebuildTimer = null;
    for (const key of this.dirty) {
      const [cx, cz] = key.split(",").map(Number);
      const old = this.meshes.get(key);
      if (old) {
        this.land.remove(old.mesh);
        dispose(old.mesh);
        this.meshes.delete(key);
      }
      const geometry = this.chunkGeometry(cx, cz);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial());
      this.land.add(mesh);
      this.meshes.set(key, { mesh, canvas: undefined });
    }
    this.dirty.clear();
    this.thumbsChanged();
    this.moved();
  }

  // The height at a sample, counted across the whole continent, or NaN off its tiles.
  sample(gx, gz) {
    const tx = Math.floor(gx / SAMPLES);
    const tz = Math.floor(gz / SAMPLES);
    const tile = this.heights.get(`${tx},${tz}`);
    return tile ? tile.heights[(gz - tz * SAMPLES) * SAMPLES + (gx - tx * SAMPLES)] : NaN;
  }

  // The ground at a scene position, in ft as drawn, or 0 off the land.
  groundAt(x, z) {
    const h = this.sample(Math.round(x / SAMPLE_FT - 0.5), Math.round(z / SAMPLE_FT - 0.5));
    return Number.isNaN(h) ? 0 : h * this.exaggeration;
  }

  // A chunk's sheet: SIDE + 1 samples square, the last row and column from the chunks east and
  // south, so the sheets meet. Squares with a corner off the land are left out.
  chunkGeometry(cx, cz) {
    const n = SIDE + 1;
    const [gx0, gz0] = [cx * SIDE, cz * SIDE];
    const h = new Float32Array((n + 2) * (n + 2)); // with a border, for the normals
    let any = false;
    for (let b = -1; b <= n; b++) for (let a = -1; a <= n; a++) h[(b + 1) * (n + 2) + a + 1] = this.sample(gx0 + a, gz0 + b);
    const at = (a, b) => h[(b + 1) * (n + 2) + a + 1];
    const positions = new Float32Array(n * n * 3);
    const normals = new Float32Array(n * n * 3);
    const uvs = new Float32Array(n * n * 2);
    for (let b = 0; b < n; b++) {
      for (let a = 0; a < n; a++) {
        const v = b * n + a;
        const y = at(a, b);
        const dry = Number.isNaN(y);
        positions.set([(gx0 + a + 0.5) * SAMPLE_FT, dry ? 0 : y, (gz0 + b + 0.5) * SAMPLE_FT], v * 3);
        const near = (da, db) => (Number.isNaN(at(a + da, b + db)) ? y : at(a + da, b + db));
        const dx = (near(1, 0) - near(-1, 0)) / (2 * SAMPLE_FT);
        const dz = (near(0, 1) - near(0, -1)) / (2 * SAMPLE_FT);
        const length = Math.hypot(dx, 1, dz) || 1;
        normals.set(dry ? [0, 1, 0] : [-dx / length, 1 / length, -dz / length], v * 3);
        uvs.set([(a + 0.5) / SIDE, (b + 0.5) / SIDE], v * 2);
      }
    }
    const indices = [];
    for (let b = 0; b < n - 1; b++) {
      for (let a = 0; a < n - 1; a++) {
        if ([at(a, b), at(a + 1, b), at(a, b + 1), at(a + 1, b + 1)].some(Number.isNaN)) continue;
        const v = b * n + a;
        indices.push(v, v + n, v + 1, v + 1, v + n, v + n + 1);
        any = true;
      }
    }
    if (!any) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(indices), 1));
    return geometry;
  }

  // --- the camera ---

  // Keeps the point looked at on the ground and the camera above it, then draws.
  moved() {
    if (this.adjusting) return;
    this.adjusting = true;
    const { target } = this.controls;
    const lift = this.groundAt(target.x, target.z) - target.y;
    target.y += lift;
    this.camera.position.y += lift;
    const floor = this.groundAt(this.camera.position.x, this.camera.position.z) + ABOVE_GROUND_FT;
    if (this.camera.position.y < floor) this.camera.position.y = floor;
    this.controls.update();
    this.adjusting = false;
    this.render();
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render() {
    if (!this.shown || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.renderer.render(this.scene, this.camera);
    });
  }
}

function texture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.anisotropy = 4;
  return t;
}

function dispose(mesh) {
  mesh.geometry.dispose();
  mesh.material.map?.dispose();
  mesh.material.dispose();
}

// Workers reading tiles' heights, nearest the view first.
class HeightPool {
  constructor(onResult) {
    this.onResult = onResult;
    this.size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    this.workers = [];
    this.idle = [];
    this.queue = [];
  }

  read(items) {
    this.queue = items;
    this.feed();
  }

  clear() {
    this.queue = [];
  }

  feed() {
    while (this.queue.length) {
      if (!this.idle.length && this.workers.length < this.size) this.spawn();
      if (!this.idle.length) return;
      const { key, gz } = this.queue.shift();
      this.idle.pop().postMessage({ key, gz });
    }
  }

  spawn() {
    const worker = new Worker(new URL("./overviewWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data: { key, heights, error } }) => {
      if (error) console.warn(`couldn't read tile ${key}: ${error}`);
      else this.onResult(key, heights);
      this.idle.push(worker);
      this.feed();
    };
    this.workers.push(worker);
    this.idle.push(worker);
  }
}
