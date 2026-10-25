import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { gunzipSync } from "fflate";
import { TILE_FT } from "../world/constants.js";
import { decodeTile } from "../world/tileCodec.js";
import { findTrees } from "../world/trees.js";
import { PINS, STROKES } from "./features.js";
import { labelPoint, rings, tilesTouched } from "./region.js";
import { terrainMesh, waterMesh } from "./terrainMesh.js";
import { treeMeshes } from "./treeMeshes.js";
import { surfaceTiles } from "./thumbnails.js";

const RING_TILES = 2; // tiles drawn in full around the active zone's editable tiles
const SEA = 0x1d4a6a;
const SKY = 0x9db8cc;
const BOUNDARY_LIFT_FT = 6;
const BOUNDARY_STEP_FT = 32;
const ACTIVE = 0xf0c850;
const PIN_LIFT_FT = 150; // pin heads float this far above the ground
const PIN_STAB_FT = 20; // and their sticks reach this far into it
const PIN_SIZE = 0.035; // head sizes, as a fraction of the view's height
const POINT_SIZE = 0.022;
const DRAG_PX = 4; // a press that moves less than this is a click

// The editor's 3D view: the active zone's tiles plus a ring around them as lit terrain with river
// water, every other existing tile as its thumbnail on the sea, and every zone's boundary draped
// over the ground. Pins stand on sticks stabbed into the ground, with strokes strung between their
// points' heads; `handlers` hears about hovering, dragging and clicking those heads, and about
// presses on the ground. Trees stand on the tiles drawn in full. Positions are feet relative to the active zone's middle, so float32 stays
// precise.
export class RenderView {
  constructor(canvas, handlers = {}) {
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
    this.marks = new THREE.Group();
    this.trees = new THREE.Group();
    this.scene.add(this.content, this.marks, this.trees);
    this.decoded = new Map(); // "tx,tz" -> decoded tile, for the tiles drawn in full
    this.surfaces = [sea]; // what a pointer can land on
    this.heads = []; // pin heads a pointer can pick
    this.textures = { circle: markTexture("circle"), diamond: markTexture("diamond"), square: markTexture("square") };
    this.raycaster = new THREE.Raycaster();
    this.handlers = handlers;
    this.press = null;
    this.dragging = false;
    // Capture runs this before OrbitControls' own listener, so a grabbed head can turn orbiting off.
    canvas.addEventListener("pointerdown", (e) => this.onDown(e), { capture: true });
    canvas.addEventListener("pointermove", (e) => this.onMove(e));
    canvas.addEventListener("pointerup", (e) => this.onUp(e));
    canvas.addEventListener("pointerleave", () => this.hover(null));
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
  show(state, { keepCamera = false } = {}) {
    const { world, continent, active, thumbnails } = state;
    this.clear();
    const editable = active ? tilesTouched(active.region) : [];
    const near = new Set();
    for (const [tx, tz] of editable) {
      for (let dx = -RING_TILES; dx <= RING_TILES; dx++) {
        for (let dz = -RING_TILES; dz <= RING_TILES; dz++) near.add(`${tx + dx},${tz + dz}`);
      }
    }

    const decoded = new Map();
    this.decoded = decoded;
    for (const { tx, tz, path } of surfaceTiles(world, continent)) {
      if (near.has(`${tx},${tz}`)) decoded.set(`${tx},${tz}`, decodeTile(gunzipSync(world.files.get(path))));
    }

    const middle = active?.region.length ? labelPoint(active.region) : [0, 0];
    this.origin = [middle[0] * TILE_FT, middle[1] * TILE_FT];
    const ground = groundSampler(decoded, this.origin);
    this.ground = ground;

    const groundMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    const waterMaterial = new THREE.MeshLambertMaterial({ color: 0x3a78b8, transparent: true, opacity: 0.85 });
    for (const [key, tile] of decoded) {
      const [tx, tz] = key.split(",").map(Number);
      const neighbours = {
        east: decoded.get(`${tx + 1},${tz}`),
        south: decoded.get(`${tx},${tz + 1}`),
        southEast: decoded.get(`${tx + 1},${tz + 1}`),
      };
      const terrain = new THREE.Mesh(geometry(terrainMesh(tile, neighbours, this.origin)), groundMaterial);
      this.content.add(terrain);
      this.surfaces.push(terrain);
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
      this.surfaces.push(plane);
    }

    if (!keepCamera) {
      // Back off far enough to frame the active zone's tiles, looking north from the south.
      const xs = editable.map(([tx]) => tx);
      const zs = editable.map(([, tz]) => tz);
      const extent = editable.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + 1 : 8;
      const distance = extent * TILE_FT * 0.75;
      const y = Math.max(0, ground(0, 0) || 0);
      this.controls.target.set(0, y, 0);
      this.camera.position.set(0, y + distance * 0.8, distance);
      this.controls.update();
    }
    this.showTrees();
    this.showMarks(state);
    this.resize();
  }

  // Swaps in a changed copy of a tile drawn in full, such as one being painted, and redraws the
  // trees. The ground stays as it was until the next show().
  setTile(tx, tz, tile) {
    const key = `${tx},${tz}`;
    if (!this.decoded.has(key)) return;
    this.decoded.set(key, tile);
    this.showTrees();
    this.render();
  }

  // Every tree on the tiles drawn in full.
  showTrees() {
    for (const child of [...this.trees.children]) {
      child.dispose();
      this.trees.remove(child);
    }
    const trees = [];
    for (const tile of this.decoded.values()) {
      const [tx, tz] = tile.coords;
      for (const { i, j, size, kind } of findTrees(tile)) {
        let ground = Infinity;
        for (let dj = 0; dj < size; dj++) {
          for (let di = 0; di < size; di++) ground = Math.min(ground, tile.layers.height[(j + dj) * tile.cells + i + di]);
        }
        const x = (tx * tile.cells + i + size / 2) * tile.cellFt - this.origin[0];
        const z = (tz * tile.cells + j + size / 2) * tile.cellFt - this.origin[1];
        trees.push({ x, z, ground, size, kind });
      }
    }
    if (trees.length) this.trees.add(...treeMeshes(trees));
  }

  // Zone outlines and, when `pins` is on, every zone's pins and strokes, with the active zone's
  // brighter. Cheap, so it's redone on every edit and drag.
  showMarks({ zones, active, selected, pins, kinds, lines = [] }) {
    empty(this.marks);
    this.heads = [];
    for (const zone of zones) {
      const mine = zone.key === active?.key;
      for (const { points } of rings(zone.region)) this.marks.add(boundary(points, this.ground, this.origin, mine ? ACTIVE : 0xffffff));
      if (pins) this.addFeatures(zone, mine, mine ? selected : null, kinds, lines);
    }
    this.render();
  }

  // Features of `kinds` on sticks, and strokes of `lines` kinds draped over the ground as plain
  // lines.
  addFeatures(zone, mine, selected, kinds, lines) {
    const opacity = mine ? 1 : 0.45;
    const sticks = [];
    // A stick under a point; returns where its head goes and the ground there.
    const stick = ([tx, tz]) => {
      const x = tx * TILE_FT - this.origin[0];
      const z = tz * TILE_FT - this.origin[1];
      const ground = this.ground(x, z);
      const y = Number.isNaN(ground) ? 0 : ground;
      sticks.push(x, y - PIN_STAB_FT, z, x, y + PIN_LIFT_FT, z);
      return { top: new THREE.Vector3(x, y + PIN_LIFT_FT, z), ground };
    };

    for (const stroke of zone.strokes) {
      const color = STROKES[stroke.kind]?.color ?? "#fff";
      if (lines.includes(stroke.kind)) {
        this.marks.add(boundary(stroke.points, this.ground, this.origin, color, false));
        continue;
      }
      if (!kinds.includes(stroke.kind)) continue;
      const picked = selected?.type === "stroke" && selected.id === stroke.id;
      const points = stroke.points.map(stick);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points.map((p) => p.top)),
        new THREE.LineBasicMaterial({ color: picked ? "#fff" : color, transparent: true, opacity }),
      );
      this.marks.add(line);
      points.forEach(({ top, ground }, index) => {
        const hit = { zone: zone.key, type: "stroke", id: stroke.id, index, ground };
        this.addHead(top, "circle", color, POINT_SIZE, { opacity, picked, hit });
      });
    }
    for (const pin of zone.pins) {
      if (!kinds.includes(pin.kind)) continue;
      const { top, ground } = stick(pin.at);
      const picked = selected?.type === "pin" && selected.id === pin.id;
      const hit = { zone: zone.key, type: "pin", id: pin.id, ground };
      const shape = { height: "diamond", biome: "square" }[pin.kind] ?? "circle";
      this.addHead(top, shape, PINS[pin.kind]?.color ?? "#fff", PIN_SIZE, { opacity, picked, hit });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(sticks, 3));
    this.marks.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: opacity * 0.8 })));
  }

  // A head drawn at the same size however far away it is, and over the terrain so hills don't hide
  // it. A picked head gets a white halo.
  addHead(position, shape, color, size, { opacity, picked, hit }) {
    const sprite = (map, tint, scale, order) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: tint, sizeAttenuation: false, transparent: true, opacity, depthTest: false }));
      s.position.copy(position);
      s.scale.setScalar(scale);
      s.renderOrder = order;
      this.marks.add(s);
      return s;
    };
    if (picked) sprite(this.textures[shape], "#fff", size * 1.5, 1);
    const head = sprite(this.textures[shape], color, size, 2);
    head.userData.hit = hit;
    this.heads.push(head);
  }

  clear() {
    empty(this.content);
    this.surfaces.length = 1; // keep the sea
  }

  // --- pointer ---

  ray(e) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster;
  }

  pick(e) {
    return this.ray(e).intersectObjects(this.heads)[0]?.object.userData.hit ?? null;
  }

  // The continent tile position under the pointer, or null off the edge of the world.
  tileAt(e) {
    const point = this.ray(e).intersectObjects(this.surfaces)[0]?.point;
    return point ? [(point.x + this.origin[0]) / TILE_FT, (point.z + this.origin[1]) / TILE_FT] : null;
  }

  hover(hit, e) {
    this.canvas.style.cursor = hit ? "pointer" : "";
    this.handlers.hover?.(hit, e);
  }

  onDown(e) {
    if (e.button !== 0) return;
    const hit = this.pick(e);
    this.press = { x: e.clientX, y: e.clientY, hit };
    const took = hit ? this.handlers.grab?.(hit) : this.handlers.press?.(this.tileAt(e), e);
    if (took) {
      this.dragging = true;
      this.controls.enabled = false;
      this.canvas.setPointerCapture(e.pointerId);
      this.hover(null);
    }
  }

  onMove(e) {
    if (this.dragging) {
      const tile = this.tileAt(e);
      if (tile) this.handlers.drag?.(tile, e);
    } else if (!e.buttons) {
      this.hover(this.pick(e), e);
    }
  }

  onUp(e) {
    const press = this.press;
    this.press = null;
    if (this.dragging) {
      this.dragging = false;
      this.controls.enabled = true;
      this.handlers.drop?.();
    } else if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_PX) {
      this.handlers.click?.(press.hit, this.tileAt(e));
    }
  }
}

// Disposes a group's children. Sprites share one geometry and the heads share their textures, so
// those stay; thumbnail textures go.
function empty(group) {
  for (const child of [...group.children]) {
    if (!child.isSprite) child.geometry.dispose();
    if (child.material.map && !child.isSprite) child.material.map.dispose();
    child.material.dispose();
    group.remove(child);
  }
}

// A white shape with a dark rim, tinted per pin by the sprite's color.
function markTexture(shape) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.beginPath();
  if (shape === "diamond") {
    ctx.moveTo(32, 4);
    ctx.lineTo(60, 32);
    ctx.lineTo(32, 60);
    ctx.lineTo(4, 32);
    ctx.closePath();
  } else if (shape === "square") {
    ctx.rect(10, 10, 44, 44);
  } else {
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
  }
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#111";
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function geometry({ positions, colors, indices }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (colors) g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  return g;
}

// Ground height at a point relative to the origin, from the decoded tiles (nearest cell), or NaN
// where no tile is loaded.
function groundSampler(decoded, origin) {
  return (x, z) => {
    const wx = x + origin[0];
    const wz = z + origin[1];
    const tx = Math.floor(wx / TILE_FT);
    const tz = Math.floor(wz / TILE_FT);
    const tile = decoded.get(`${tx},${tz}`);
    if (!tile) return NaN;
    const i = Math.min(tile.cells - 1, Math.floor((wx - tx * TILE_FT) / tile.cellFt));
    const j = Math.min(tile.cells - 1, Math.floor((wz - tz * TILE_FT) / tile.cellFt));
    const k = j * tile.cells + i;
    const water = tile.layers.water[k];
    return Math.max(tile.layers.height[k], Number.isNaN(water) ? -Infinity : water, 0);
  };
}

// The highest ground within a cell of a point, so lines along a coast ride the cliff top.
function top(ground, x, z) {
  let best = 0;
  for (const [dx, dz] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) best = Math.max(best, ground(x + dx, z + dz) || 0);
  return best;
}

// A zone outline laid over the ground, a little above it, or an open line with `closed` off.
function boundary(points, ground, origin, color, closed = true) {
  const out = [];
  const ring = closed ? [...points, points[0]] : points;
  for (let i = 1; i < ring.length; i++) {
    const [ax, az] = [ring[i - 1][0] * TILE_FT - origin[0], ring[i - 1][1] * TILE_FT - origin[1]];
    const [bx, bz] = [ring[i][0] * TILE_FT - origin[0], ring[i][1] * TILE_FT - origin[1]];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / BOUNDARY_STEP_FT));
    for (let s = 0; s < steps; s++) {
      const x = ax + ((bx - ax) * s) / steps;
      const z = az + ((bz - az) * s) / steps;
      out.push(x, top(ground, x, z) + BOUNDARY_LIFT_FT, z);
    }
  }
  const [lx, lz] = [ring.at(-1)[0] * TILE_FT - origin[0], ring.at(-1)[1] * TILE_FT - origin[1]];
  out.push(lx, top(ground, lx, lz) + BOUNDARY_LIFT_FT, lz);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
}
