import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { gunzipSync } from "fflate";
import { TILE_FT, WATER_KINDS } from "../world/constants.js";
import { decodeTile } from "../world/tileCodec.js";
import { findTrees } from "../world/trees.js";
import { PINS, STROKES } from "./features.js";
import { labelPoint, rings, tilesTouched } from "./region.js";
import { terrainMesh, waterMesh } from "./terrainMesh.js";
import { setTreeSight, treeMeshes, treeStage } from "./treeMeshes.js";
import { clutterMeshes, setClutterFocus } from "./clutterMeshes.js";
import { clutterForTile } from "../world/clutter.js";
import { objectMeshes, setObjectSight } from "./objectMeshes.js";
import { Walker } from "./walker.js";
import { surfaceTiles, tilePath } from "./thumbnails.js";
import { groundMaterial } from "./groundMaterial.js";
import { HORIZON, SUN_DIR, Sky } from "./sky.js";

const RING_TILES = 3; // tiles drawn in full around the active zone's editable tiles
// What you can see while walking (plans/design.md, "Vision"): fog from `fogStartFt` to
// `fogEndFt`, the 7×7 tiles around you (`tiles` either side), objects out to `smallFt` (or
// `largeFt` for large ones), and tree crowns drawn in simpler stages past each of `canopyFt`,
// dissolving from one to the next across `canopyBandFt`.
export const SIGHT = { fogStartFt: 350, fogEndFt: 1400, tiles: 3, smallFt: 500, largeFt: 1000, canopyFt: [250, 350, 450], canopyBandFt: 40 };
const ORBIT_FOG = [6000, 30000];

// Fog thickens with straight-line distance from the camera, so turning doesn't move it, and along
// a steep curve, so the middle distance stays clear and it closes in late: 6% at 700ft, 30% at
// 1,000ft, 59% at 1,200ft (with SIGHT's numbers). three.js's own fog is a smoothstep on depth,
// which reads as foggy weather.
const FOG_CURVE = 2.5;
THREE.ShaderChunk.fog_vertex = THREE.ShaderChunk.fog_vertex.replace("vFogDepth = - mvPosition.z;", "vFogDepth = length( mvPosition.xyz );");
THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(
  "float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );",
  `float fogFactor = pow( clamp( ( vFogDepth - fogNear ) / ( fogFar - fogNear ), 0.0, 1.0 ), ${FOG_CURVE.toFixed(1)} );`,
);
const SEA = 0x1d4a6a;
const SKY = HORIZON;
const BOUNDARY_LIFT_FT = 6;
const BOUNDARY_STEP_FT = 32;
const ACTIVE = 0xf0c850;
const PIN_LIFT_FT = 150; // pin heads float this far above the ground
const PIN_STAB_FT = 20; // and their sticks reach this far into it
const PIN_SIZE = 0.035; // head sizes, as a fraction of the view's height
const POINT_SIZE = 0.022;
const DRAG_PX = 4; // a press that moves less than this is a click
const KEY = { pan: 0.8, zoom: 1.6, turn: 1.5 }; // per second: distances panned, e^zoom, radians
const CLUTTER_VIEW_FT = 1500; // ground clutter shows when the camera's this close to what it looks at

// The editor's 3D view: the active zone's tiles plus a ring around them as lit terrain with river
// water, every other existing tile as its thumbnail on the sea, and every zone's boundary draped
// over the ground. Pins stand on sticks stabbed into the ground, with strokes strung between their
// points' heads; `handlers` hears about hovering, dragging and clicking those heads, and about
// presses on the ground. Trees stand on the tiles drawn in full. Positions are feet relative to the active zone's middle, so float32 stays
// precise.
export class RenderView {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    // The view spans half a foot to many miles, too much for a plain depth buffer: near surfaces
    // like the sea and the low ground fight and flicker. A reversed depth buffer fixes that where
    // the browser has it, and a logarithmic one elsewhere.
    const reversed = hasClipControl();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, reversedDepthBuffer: reversed, logarithmicDepthBuffer: !reversed });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, ...ORBIT_FOG);
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    this.camera = new THREE.PerspectiveCamera(50, 1, 5, 120000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.addEventListener("change", () => this.render());

    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x445533, 1.1));
    const sun = new THREE.DirectionalLight(0xfff6e8, 1.6);
    sun.position.copy(SUN_DIR);
    this.scene.add(sun);

    this.content = new THREE.Group();
    this.marks = new THREE.Group();
    this.trees = new THREE.Group();
    this.clutter = new THREE.Group();
    this.objects = new THREE.Group();
    this.scene.add(this.content, this.marks, this.trees, this.clutter, this.objects);
    this.clutterTiles = new Map(); // "tx,tz" -> that tile's clutter, worked out when first needed
    this.clutterAround = null; // the tile clutter is drawn around
    this.decoded = new Map(); // "tx,tz" -> decoded tile, for the tiles drawn in full
    this.surfaces = []; // what a pointer can land on
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

  // Keyboard navigation (keyNav.js): pans across the ground relative to where the camera faces, at
  // a speed that scales with the camera's distance; zooms toward the target; turns around it.
  nudge(dt, { x, z, zoom, turn }) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const forward = offset.clone().setY(0).normalize().negate();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const step = forward.multiplyScalar(-z).add(right.multiplyScalar(x)).multiplyScalar(offset.length() * KEY.pan * dt);
    this.controls.target.add(step);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * KEY.turn * dt);
    offset.multiplyScalar(Math.exp(-zoom * KEY.zoom * dt));
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.render();
  }

  render() {
    if (this.streaming && this.walking) {
      const { pos } = this.walker;
      this.streamAround(Math.floor((pos.x + this.origin[0]) / TILE_FT), Math.floor((pos.z + this.origin[1]) / TILE_FT));
    }
    this.sky.update(this.camera, performance.now() / 1000);
    this.showSight();
    this.showClutter();
    this.renderer.render(this.scene, this.camera);
  }

  // Walking limits what you see to SIGHT; orbiting shows everything.
  showSight() {
    const walking = this.walking;
    if (walking !== this.sightWalking) {
      this.sightWalking = walking;
      [this.scene.fog.near, this.scene.fog.far] = walking ? [SIGHT.fogStartFt, SIGHT.fogEndFt] : ORBIT_FOG;
      this.camera.far = walking ? SIGHT.fogEndFt + 100 : 120000;
      this.camera.updateProjectionMatrix();
      this.sightTile = null;
    }
    if (!this.origin) return;
    // Tree crowns simplify with distance from the walker, or from what the camera looks at.
    const focus = walking ? this.walker.pos : this.controls.target;
    setTreeSight(focus.x, focus.z, SIGHT.canopyFt, { band: SIGHT.canopyBandFt, solid: this.solidCanopies });
    const [tx, tz] = [Math.floor((focus.x + this.origin[0]) / TILE_FT), Math.floor((focus.z + this.origin[1]) / TILE_FT)];
    const near = (at) => !walking || !at || (Math.abs(at[0] - tx) <= SIGHT.tiles && Math.abs(at[1] - tz) <= SIGHT.tiles);
    this.showTreeStages(focus, near);
    if (!walking) {
      setObjectSight(0, 0, Infinity, Infinity);
      if (this.sightTile !== null) for (const child of this.content.children) child.visible = true;
      this.sightTile = null;
      return;
    }
    setObjectSight(focus.x, focus.z, SIGHT.smallFt, SIGHT.largeFt);
    const key = `${tx},${tz}`;
    if (key === this.sightTile) return;
    this.sightTile = key;
    for (const child of this.content.children) child.visible = near(child.userData.tile);
  }

  // Each tile's tree meshes draw only when some tree on that tile can need them: trunks within
  // sight, and each crown layer while the tile's nearest or farthest tree is in its stages.
  showTreeStages(focus, near) {
    for (const mesh of this.trees.children) {
      const at = mesh.userData.tile;
      mesh.visible = near(at);
      const stages = mesh.userData.stages;
      if (!mesh.visible || !stages) continue;
      const [x0, z0] = [at[0] * TILE_FT - this.origin[0], at[1] * TILE_FT - this.origin[1]];
      const dx = Math.max(x0 - focus.x, 0, focus.x - x0 - TILE_FT);
      const dz = Math.max(z0 - focus.z, 0, focus.z - z0 - TILE_FT);
      const farX = Math.max(Math.abs(focus.x - x0), Math.abs(focus.x - x0 - TILE_FT));
      const farZ = Math.max(Math.abs(focus.z - z0), Math.abs(focus.z - z0 - TILE_FT));
      const least = treeStage(Math.hypot(dx, dz));
      const most = treeStage(Math.hypot(farX, farZ));
      mesh.visible = most > stages[0] - 1 && least < stages[1] + 1;
    }
  }

  // Ground clutter on the 3×3 tiles around where you're looking (or walking), when the camera's
  // close enough to see it. It's redrawn when that moves to another tile.
  showClutter() {
    if (!this.origin) return;
    const focus = this.walking ? this.walker.pos : this.controls.target;
    this.clutter.visible = this.walking || this.camera.position.distanceTo(focus) < CLUTTER_VIEW_FT;
    if (!this.clutter.visible) return;
    setClutterFocus(focus.x, focus.z);
    const [tx, tz] = [Math.floor((focus.x + this.origin[0]) / TILE_FT), Math.floor((focus.z + this.origin[1]) / TILE_FT)];
    const key = `${tx},${tz}`;
    if (key === this.clutterAround) return;
    this.clutterAround = key;
    for (const child of [...this.clutter.children]) {
      child.dispose();
      this.clutter.remove(child);
    }
    const tileAt = (x, z) => this.decoded.get(`${x},${z}`);
    const instances = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const near = `${tx + dx},${tz + dz}`;
        const tile = this.decoded.get(near);
        if (!tile) continue;
        if (!this.clutterTiles.has(near)) this.clutterTiles.set(near, clutterForTile(tile, tileAt));
        instances.push(...this.clutterTiles.get(near));
      }
    }
    if (instances.length) this.clutter.add(...clutterMeshes(instances, this.origin));
  }

  // Walk mode (walker.js): a character dropped at scene [x, z], or where the camera looks. onStop
  // runs when it ends, however it ends.
  startWalk(onStop, at = [this.controls.target.x, this.controls.target.z]) {
    this.walker ??= new Walker(this, {
      onStop: () => {
        this.controls.enabled = true;
        this.showPins();
        this.walkStopped?.();
      },
    });
    this.walkStopped = onStop;
    this.controls.enabled = false;
    this.hover(null);
    this.walker.start(at);
    this.showPins();
  }

  stopWalk() {
    this.walker?.stop();
  }

  get walking() {
    return Boolean(this.walker?.active);
  }

  // Pins and strokes hide while walking; zone outlines stay.
  showPins() {
    for (const child of this.marks.children) child.visible = !this.walking || Boolean(child.userData.outline);
  }

  // Rebuilds everything from the world. `keepCamera` leaves the view where it is.
  show(state, { keepCamera = false } = {}) {
    this.streaming = null;
    if (!keepCamera) this.stopWalk();
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
    this.sightTile = null;
    this.clutterTiles.clear();
    this.clutterAround = null;
    this.unreadable = []; // tiles near the zone that couldn't be read, such as ones from an old format
    for (const { tx, tz, path } of surfaceTiles(world, continent)) {
      if (!near.has(`${tx},${tz}`)) continue;
      try {
        decoded.set(`${tx},${tz}`, decodeTile(gunzipSync(world.files.get(path))));
      } catch (err) {
        console.warn(`couldn't read ${path}: ${err.message}`);
        this.unreadable.push(path);
      }
    }

    const middle = active?.region.length ? labelPoint(active.region) : [0, 0];
    this.origin = [middle[0] * TILE_FT, middle[1] * TILE_FT];
    const ground = groundSampler(decoded, this.origin);
    this.ground = ground;

    for (const key of decoded.keys()) this.buildGround(key);
    this.buildOcean([...decoded.keys()]);

    // Everything farther out is its thumbnail, lying on the sea.
    for (const { tx, tz } of surfaceTiles(world, continent)) {
      const image = thumbnails.get(tx, tz);
      if (!image || decoded.has(`${tx},${tz}`)) continue;
      const texture = new THREE.CanvasTexture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(TILE_FT, TILE_FT), new THREE.MeshBasicMaterial({ map: texture }));
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((tx + 0.5) * TILE_FT - this.origin[0], 0.5, (tz + 0.5) * TILE_FT - this.origin[1]);
      plane.userData.tile = [tx, tz];
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
    this.showObjects();
    this.showMarks(state);
    this.resize();
  }

  // A tile's ground and water meshes, from its decoded copy and its neighbours to the east and
  // south, which it reaches over to close the seams.
  buildGround(key) {
    const { decoded } = this;
    const tile = decoded.get(key);
    const [tx, tz] = key.split(",").map(Number);
    this.terrainMaterial ??= groundMaterial(this.renderer);
    this.waterMaterials ??= {
      sea: new THREE.MeshLambertMaterial({ color: SEA }),
      fresh: new THREE.MeshLambertMaterial({ color: 0x3a78b8, transparent: true, opacity: 0.85 }),
    };
    const neighbours = {
      east: decoded.get(`${tx + 1},${tz}`),
      south: decoded.get(`${tx},${tz + 1}`),
      southEast: decoded.get(`${tx + 1},${tz + 1}`),
    };
    const terrain = new THREE.Mesh(geometry(terrainMesh(tile, neighbours, this.origin, 1)), this.terrainMaterial);
    terrain.userData.tile = [tx, tz];
    this.content.add(terrain);
    this.surfaces.push(terrain);
    for (const kind of WATER_KINDS) {
      const water = waterMesh(tile, neighbours, this.origin, kind);
      if (!water) continue;
      const mesh = new THREE.Mesh(geometry(water), this.waterMaterials[kind]);
      mesh.userData.tile = [tx, tz];
      this.content.add(mesh);
    }
  }

  // Open sea wherever no tile is drawn in full (`keys` are the ones that are); those tiles draw
  // their own.
  buildOcean(keys) {
    if (this.ocean) {
      this.content.remove(this.ocean);
      this.ocean.geometry.dispose();
      this.surfaces.splice(this.surfaces.indexOf(this.ocean), 1);
    }
    this.ocean = new THREE.Mesh(oceanGeometry(keys, this.origin), this.waterMaterials.sea);
    this.content.add(this.ocean);
    this.surfaces.push(this.ocean);
  }

  // Walk mode straight from the map, without drawing the whole zone: the character starts at
  // continent feet [x, z], and only the tiles around them load, a tile farther than sight beyond
  // what's drawn so seams close. They load and drop as the character crosses tiles.
  walkFrom(state, [x, z], onStop) {
    this.streaming = null;
    this.stopWalk();
    this.clear();
    this.decoded = new Map();
    this.sightTile = null;
    this.clutterTiles.clear();
    this.clutterAround = null;
    this.unreadable = [];
    const [tx, tz] = [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
    this.origin = [(tx + 0.5) * TILE_FT, (tz + 0.5) * TILE_FT];
    this.ground = groundSampler(this.decoded, this.origin);
    this.streaming = { world: state.world, continent: state.continent, at: null, built: new Set() };
    this.streamAround(tx, tz);
    this.showMarks(state);
    this.resize();
    const [sx, sz] = [x - this.origin[0], z - this.origin[1]];
    const y = this.ground(sx, sz) ?? 0;
    this.controls.target.set(sx, y, sz);
    this.camera.position.set(sx, y + 30, sz + 40);
    this.controls.update();
    this.startWalk(onStop, [sx, sz]);
    this.render();
  }

  // Loads and draws the tiles around tile (tx, tz) while walking from the map, and drops the
  // ones left behind.
  streamAround(tx, tz) {
    const s = this.streaming;
    const key = `${tx},${tz}`;
    if (s.at === key) return;
    s.at = key;
    const reach = SIGHT.tiles;
    const within = (k, r) => {
      const [x, z] = k.split(",").map(Number);
      return Math.abs(x - tx) <= r && Math.abs(z - tz) <= r;
    };
    for (const k of [...s.built]) {
      if (within(k, reach)) continue;
      this.dropTile(k);
      s.built.delete(k);
    }
    for (const k of [...this.decoded.keys()]) {
      if (within(k, reach + 1)) continue;
      this.decoded.delete(k);
      this.clutterTiles.delete(k);
    }
    for (let dz = -reach - 1; dz <= reach + 1; dz++) {
      for (let dx = -reach - 1; dx <= reach + 1; dx++) {
        const k = `${tx + dx},${tz + dz}`;
        if (this.decoded.has(k)) continue;
        const bytes = s.world.files.get(tilePath(s.continent, tx + dx, tz + dz));
        if (!bytes) continue;
        try {
          this.decoded.set(k, decodeTile(gunzipSync(bytes)));
        } catch (err) {
          console.warn(`couldn't read tile ${k}: ${err.message}`);
        }
      }
    }
    for (const k of this.decoded.keys()) {
      if (!within(k, reach) || s.built.has(k)) continue;
      this.buildGround(k);
      this.addTrees(this.decoded.get(k));
      this.addObjects(this.decoded.get(k));
      s.built.add(k);
    }
    this.buildOcean([...s.built]);
    this.clutterAround = null;
    this.sightTile = null;
  }

  // Takes a tile's meshes out of the scene.
  dropTile(key) {
    const [tx, tz] = key.split(",").map(Number);
    for (const group of [this.content, this.trees, this.objects]) {
      for (const child of [...group.children]) {
        const at = child.userData.tile;
        if (!at || at[0] !== tx || at[1] !== tz) continue;
        group.remove(child);
        if (child.isInstancedMesh) child.dispose();
        else child.geometry.dispose();
        if (group === this.content) this.surfaces.splice(this.surfaces.indexOf(child), 1);
      }
    }
  }

  // Swaps in a changed copy of a tile drawn in full, such as one being painted, and redraws the
  // trees. The ground stays as it was until the next show().
  setTile(tx, tz, tile) {
    const key = `${tx},${tz}`;
    if (!this.decoded.has(key)) return;
    this.decoded.set(key, tile);
    this.clutterTiles.delete(key);
    this.clutterAround = null;
    this.showTrees();
    this.showObjects();
    this.render();
  }

  // Every object on the tiles drawn in full.
  showObjects() {
    for (const child of [...this.objects.children]) {
      child.dispose();
      this.objects.remove(child);
    }
    for (const tile of this.decoded.values()) this.addObjects(tile);
  }

  addObjects(tile) {
    if (!tile.objects?.length) return;
    const tileAt = (x, z) => this.decoded.get(`${x},${z}`);
    for (const mesh of objectMeshes(tile.objects, tileAt, this.origin)) {
      mesh.userData.tile = tile.coords;
      this.objects.add(mesh);
    }
  }

  // Every tree on the tiles drawn in full.
  showTrees() {
    for (const child of [...this.trees.children]) {
      child.dispose();
      this.trees.remove(child);
    }
    for (const tile of this.decoded.values()) this.addTrees(tile);
  }

  // A tile's trees, as a set of meshes per tile so whole tiles can be left out.
  addTrees(tile) {
    const [tx, tz] = tile.coords;
    const trees = [];
    for (const { i, j, size, kind } of findTrees(tile)) {
      let ground = Infinity;
      for (let dj = 0; dj < size; dj++) {
        for (let di = 0; di < size; di++) ground = Math.min(ground, tile.layers.height[(j + dj) * tile.cells + i + di]);
      }
      const x = (tx * tile.cells + i + size / 2) * tile.cellFt - this.origin[0];
      const z = (tz * tile.cells + j + size / 2) * tile.cellFt - this.origin[1];
      trees.push({ x, z, ground, size, kind });
    }
    for (const mesh of treeMeshes(trees)) {
      mesh.userData.tile = [tx, tz];
      this.trees.add(mesh);
    }
  }

  // Zone outlines and, when `pins` is on, every zone's pins and strokes, with the active zone's
  // brighter. Cheap, so it's redone on every edit and drag.
  showMarks({ zones, active, selected, pins, kinds, lines = [] }) {
    empty(this.marks);
    this.heads = [];
    for (const zone of zones) {
      const mine = !active || zone.key === active.key;
      const color = zone.key === active?.key ? ACTIVE : 0xffffff;
      for (const { points } of rings(zone.region)) {
        const outline = boundary(points, this.ground, this.origin, color);
        outline.userData.outline = true;
        this.marks.add(outline);
      }
      if (pins) this.addFeatures(zone, mine, selected?.zone === zone.key ? selected : null, kinds, lines);
    }
    this.showPins();
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
    this.surfaces.length = 0;
    this.ocean = null;
    for (const group of [this.trees, this.objects]) {
      for (const child of [...group.children]) {
        child.dispose();
        group.remove(child);
      }
    }
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
    if (e.button !== 0 || this.walking) return;
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
    if (this.walking) return;
    if (this.dragging) {
      const tile = this.tileAt(e);
      if (tile) this.handlers.drag?.(tile, e);
    } else if (!e.buttons) {
      this.hover(this.pick(e), e);
    }
  }

  onUp(e) {
    if (this.walking) return;
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

function hasClipControl() {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ok = Boolean(gl?.getExtension("EXT_clip_control"));
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return ok;
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

// A flat sea at level 0 out to the horizon, leaving out the tiles drawn in full (keys "tx,tz"):
// strips around their bounding box, plus a square for each tile inside it that isn't drawn.
function oceanGeometry(keys, origin) {
  const FAR = 200000;
  const rects = [];
  if (!keys.length) {
    rects.push([-FAR, -FAR, FAR, FAR]);
  } else {
    const tiles = keys.map((key) => key.split(",").map(Number));
    const xs = tiles.map(([tx]) => tx);
    const zs = tiles.map(([, tz]) => tz);
    const [tx0, tx1, tz0, tz1] = [Math.min(...xs), Math.max(...xs) + 1, Math.min(...zs), Math.max(...zs) + 1];
    const [x0, x1, z0, z1] = [tx0 * TILE_FT - origin[0], tx1 * TILE_FT - origin[0], tz0 * TILE_FT - origin[1], tz1 * TILE_FT - origin[1]];
    rects.push([-FAR, -FAR, x0, FAR], [x1, -FAR, FAR, FAR], [x0, -FAR, x1, z0], [x0, z1, x1, FAR]);
    const drawn = new Set(keys);
    for (let tx = tx0; tx < tx1; tx++) {
      for (let tz = tz0; tz < tz1; tz++) {
        if (drawn.has(`${tx},${tz}`)) continue;
        const [x, z] = [tx * TILE_FT - origin[0], tz * TILE_FT - origin[1]];
        rects.push([x, z, x + TILE_FT, z + TILE_FT]);
      }
    }
  }
  const positions = [];
  const indices = [];
  for (const [ax, az, bx, bz] of rects) {
    const n = positions.length / 3;
    positions.push(ax, 0, az, bx, 0, az, ax, 0, bz, bx, 0, bz);
    indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
  }
  return geometry({ positions: new Float32Array(positions), indices: new Uint32Array(indices) });
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
    return Math.max(tile.layers.height[k], Number.isNaN(water) ? -Infinity : water);
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
