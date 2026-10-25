import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { gunzipSync } from "fflate";
import { TILE_FT } from "../world/constants.js";
import { decodeTile } from "../world/tileCodec.js";
import { labelPoint, rings, tilesTouched } from "./region.js";
import { terrainMesh, waterMesh } from "./terrainMesh.js";
import { surfaceTiles } from "./thumbnails.js";

const RING_TILES = 2; // tiles drawn in full around the active zone's editable tiles
const SEA = 0x1d4a6a;
const SKY = 0x9db8cc;
const BOUNDARY_LIFT_FT = 6;
const BOUNDARY_STEP_FT = 32;

// The editor's 3D view: the active zone's tiles plus a ring around them as lit terrain with river
// water, every other existing tile as its thumbnail on the sea, and every zone's boundary draped
// over the ground. Positions are feet relative to the active zone's middle, so float32 stays
// precise.
export class RenderView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 6000, 30000);
    this.camera = new THREE.PerspectiveCamera(50, 1, 5, 120000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.addEventListener("change", () => this.render());

    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x445533, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-1, 1.6, -0.8);
    this.scene.add(sun);

    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400000, 400000), new THREE.MeshLambertMaterial({ color: SEA }));
    sea.rotation.x = -Math.PI / 2;
    this.scene.add(sea);

    this.content = new THREE.Group();
    this.scene.add(this.content);
    new ResizeObserver(() => this.resize()).observe(canvas);
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
    this.renderer.render(this.scene, this.camera);
  }

  // Rebuilds everything from the world. `keepCamera` leaves the view where it is.
  show({ world, continent, zones, active, thumbnails }, { keepCamera = false } = {}) {
    this.clear();
    const editable = active ? tilesTouched(active.region) : [];
    const near = new Set();
    for (const [tx, tz] of editable) {
      for (let dx = -RING_TILES; dx <= RING_TILES; dx++) {
        for (let dz = -RING_TILES; dz <= RING_TILES; dz++) near.add(`${tx + dx},${tz + dz}`);
      }
    }

    const decoded = new Map();
    for (const { tx, tz, path } of surfaceTiles(world, continent)) {
      if (near.has(`${tx},${tz}`)) decoded.set(`${tx},${tz}`, decodeTile(gunzipSync(world.files.get(path))));
    }

    const middle = active?.region.length ? labelPoint(active.region) : [0, 0];
    this.origin = [middle[0] * TILE_FT, middle[1] * TILE_FT];
    const ground = groundSampler(decoded, this.origin);

    const groundMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    const waterMaterial = new THREE.MeshLambertMaterial({ color: 0x3a78b8, transparent: true, opacity: 0.85 });
    for (const [key, tile] of decoded) {
      const [tx, tz] = key.split(",").map(Number);
      const neighbours = {
        east: decoded.get(`${tx + 1},${tz}`),
        south: decoded.get(`${tx},${tz + 1}`),
        southEast: decoded.get(`${tx + 1},${tz + 1}`),
      };
      this.content.add(new THREE.Mesh(geometry(terrainMesh(tile, neighbours, this.origin)), groundMaterial));
      const water = waterMesh(tile, neighbours, this.origin);
      if (water) this.content.add(new THREE.Mesh(geometry(water), waterMaterial));
    }

    // Everything farther out is its thumbnail, lying on the sea.
    for (const { tx, tz } of surfaceTiles(world, continent)) {
      const image = thumbnails.get(tx, tz);
      if (!image || decoded.has(`${tx},${tz}`)) continue;
      const texture = new THREE.CanvasTexture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(TILE_FT, TILE_FT), new THREE.MeshBasicMaterial({ map: texture }));
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((tx + 0.5) * TILE_FT - this.origin[0], 0.5, (tz + 0.5) * TILE_FT - this.origin[1]);
      this.content.add(plane);
    }

    for (const zone of zones) {
      const color = zone.key === active?.key ? 0xf0c850 : 0xffffff;
      for (const { points } of rings(zone.region)) this.content.add(boundary(points, ground, this.origin, color));
    }

    if (!keepCamera) {
      // Back off far enough to frame the active zone's tiles, looking north from the south.
      const xs = editable.map(([tx]) => tx);
      const zs = editable.map(([, tz]) => tz);
      const extent = editable.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + 1 : 8;
      const distance = extent * TILE_FT * 0.75;
      const y = ground(0, 0);
      this.controls.target.set(0, y, 0);
      this.camera.position.set(0, y + distance * 0.8, distance);
      this.controls.update();
    }
    this.resize();
  }

  clear() {
    for (const child of [...this.content.children]) {
      child.geometry.dispose();
      child.material.map?.dispose();
      child.material.dispose();
      this.content.remove(child);
    }
  }
}

function geometry({ positions, colors, indices }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (colors) g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  return g;
}

// Ground height at a point relative to the origin, from the decoded tiles (nearest cell), or sea
// level where no tile is loaded.
function groundSampler(decoded, origin) {
  return (x, z) => {
    const wx = x + origin[0];
    const wz = z + origin[1];
    const tx = Math.floor(wx / TILE_FT);
    const tz = Math.floor(wz / TILE_FT);
    const tile = decoded.get(`${tx},${tz}`);
    if (!tile) return 0;
    const i = Math.min(tile.cells - 1, Math.floor((wx - tx * TILE_FT) / tile.cellFt));
    const j = Math.min(tile.cells - 1, Math.floor((wz - tz * TILE_FT) / tile.cellFt));
    const k = j * tile.cells + i;
    const water = tile.layers.water[k];
    return Math.max(tile.layers.height[k], Number.isNaN(water) ? -Infinity : water, 0);
  };
}

// A zone outline laid over the ground, a little above it.
function boundary(points, ground, origin, color) {
  const out = [];
  const ring = [...points, points[0]];
  for (let i = 1; i < ring.length; i++) {
    const [ax, az] = [ring[i - 1][0] * TILE_FT - origin[0], ring[i - 1][1] * TILE_FT - origin[1]];
    const [bx, bz] = [ring[i][0] * TILE_FT - origin[0], ring[i][1] * TILE_FT - origin[1]];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / BOUNDARY_STEP_FT));
    for (let s = 0; s < steps; s++) {
      const x = ax + ((bx - ax) * s) / steps;
      const z = az + ((bz - az) * s) / steps;
      out.push(x, ground(x, z) + BOUNDARY_LIFT_FT, z);
    }
  }
  out.push(out[0], out[1], out[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
}
