import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { gunzipSync } from "fflate";
import { TILE_FT, WATER_KINDS } from "../world/constants.js";
import { decodeTile } from "../world/tileCodec.js";
import { findTrees } from "../world/trees.js";
import { rings } from "./region.js";
import { terrainMesh, waterMesh } from "./terrainMesh.js";
import { setWaterTime, waterMaterial } from "./waterMaterial.js";
import { waterfallMeshes } from "./waterfalls.js";
import { setTreeSight, treeMeshes, treeStage } from "./treeMeshes.js";
import { clutterMeshes, gatherClutter, setClutterFocus, setClutterRadius } from "./clutterMeshes.js";
import { clutterForTile } from "../world/clutter.js";
import { structureCover } from "../world/objects.js";
import { tileWalk } from "../world/walkIndex.js";
import { CELL_FT as STRUCTURE_CELL_FT } from "../world/structures.js";
import { objectMeshes, setObjectSight } from "./objectMeshes.js";
import { Walker } from "./walker.js";
import { tilePath } from "./thumbnails.js";
import { disposeGround, groundMaterial } from "./groundMaterial.js";
import { HORIZON, Sky } from "./sky.js";
import { CYCLE_MS, cyclesAt, skyAt } from "../world/dayNight.js";
import { Stats, statsWanted } from "./stats.js";

// What you can see while walking (plans/design.md, "Vision"): fog from `fogStartFt` to
// `fogEndFt`, the 7×7 tiles around you in full (`tiles` either side), a far ring of cheap tiles
// out to the 15×15 (`farTiles`: coarse ground, stand-in trees, no objects or clutter), objects out
// to `smallFt` (or
// `largeFt` for large ones), and tree crowns drawn in simpler stages past each of `canopyFt`,
// dissolving from one to the next across `canopyBandFt`.
export const SIGHT = { fogStartFt: 350, fogEndFt: 3500, tiles: 3, farTiles: 7, farStep: 8, farSkirtFt: 40, smallFt: 500, largeFt: 1000, canopyFt: [300, 450], canopyBandFt: 40 };
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
// How many times faster than the shared clock time passes while walking, to start with: a whole
// day and night in 20 minutes (plans/notes.md).
const WALK_TIME_SPEED = CYCLE_MS / (20 * 60 * 1000);
const BOUNDARY_LIFT_FT = 6;
const BOUNDARY_STEP_FT = 32;
// What the graphics settings can leave out of the scene, and the resolutions they offer: "full" is
// the display's own pixel density, up to 2.
export const SCENE_PARTS = ["clutter", "near trees", "far ring", "objects", "ground and water", "sky"];
export const RESOLUTIONS = ["full", 1.5, 1];
// Ground clutter's radius ranges up to the least distance from the focus to the edge of the tiles
// it's made for.
export const CLUTTER_RADIUS_FT = { min: 100, max: 480 };
const pixelRatio = (resolution) => Math.min(window.devicePixelRatio || 1, resolution === "full" ? 2 : resolution);
const CLUTTER_VIEW_FT = 1500; // ground clutter shows when the camera's this close to what it looks at
const CLUTTER_REGATHER_FT = 40; // clutter drawn round the focus is picked again when it moves this far

// The editor's 3D view, for walk mode: the tiles around the walker as lit terrain with water,
// trees, objects and clutter, a cheaper far ring beyond, and every zone's boundary draped over the
// ground. `handlers.onGraphics` hears about changes to the graphics settings. Positions are feet
// relative to the tile the walk started in, so float32 stays precise.
export class RenderView {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    // The view spans half a foot to many miles, too much for a plain depth buffer: near surfaces
    // like the sea and the low ground fight and flicker. A reversed depth buffer fixes that where
    // the browser has it, and a logarithmic one elsewhere.
    const reversed = hasClipControl();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, reversedDepthBuffer: reversed, logarithmicDepthBuffer: !reversed });
    this.graphics = { hidden: new Set(), resolution: "full", solidCanopies: false, clutterRadiusFt: 240, clutterDensity: 1 };
    setClutterRadius(this.graphics.clutterRadiusFt);
    this.renderer.setPixelRatio(pixelRatio(this.graphics.resolution));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, ...ORBIT_FOG);
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    this.camera = new THREE.PerspectiveCamera(50, 1, 5, 120000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.addEventListener("change", () => this.render());

    this.ambient = new THREE.HemisphereLight();
    this.sunLight = new THREE.DirectionalLight();
    this.moonLight = new THREE.DirectionalLight();
    this.scene.add(this.ambient, this.sunLight, this.moonLight);
    // The time the sky shows, as dayNight.js cycles. It starts at the shared clock's time, and
    // passes while walking `speed` times faster than that clock.
    this.clock = { cycles: cyclesAt(Date.now()), speed: WALK_TIME_SPEED, last: null };

    this.content = new THREE.Group();
    this.marks = new THREE.Group();
    this.trees = new THREE.Group();
    this.clutter = new THREE.Group();
    this.objects = new THREE.Group();
    this.far = new THREE.Group(); // the far ring while walking: "tx,tz" tiles' cheap meshes
    this.farTiles = new Map(); // "tx,tz" -> that tile's far meshes
    this.scene.add(this.content, this.marks, this.trees, this.clutter, this.objects, this.far);
    this.clutterTiles = new Map(); // "tx,tz" -> that tile's clutter, worked out when first needed
    this.clutterAround = null; // the tile clutter is drawn around
    this.decoded = new Map(); // "tx,tz" -> decoded tile, for the tiles drawn in full
    this.handlers = handlers;
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  // Changes any of the graphics settings: hidden (a set of SCENE_PARTS), resolution (one of
  // RESOLUTIONS), solidCanopies (draws every crown as its cheapest stage), clutterRadiusFt and
  // clutterDensity (the share of clutter drawn, 0-1).
  setGraphics(changes) {
    Object.assign(this.graphics, changes);
    setClutterRadius(this.graphics.clutterRadiusFt);
    this.clutterGathered = null;
    this.renderer.setPixelRatio(pixelRatio(this.graphics.resolution));
    this.resize();
    this.handlers.onGraphics?.(this.graphics);
  }

  // The scene's groups by their names in SCENE_PARTS.
  parts() {
    return { clutter: this.clutter, "near trees": this.trees, "far ring": this.far, objects: this.objects, "ground and water": this.content, sky: this.sky.mesh };
  }

  // Hides the parts the settings leave out, after the frame's work has set what's visible. Clutter
  // and the far ring switch themselves on and off; the rest come back when no longer hidden.
  hideParts() {
    for (const [name, group] of Object.entries(this.parts())) {
      if (this.graphics.hidden.has(name)) group.visible = false;
      else if (group !== this.clutter && group !== this.far) group.visible = true;
    }
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
    if (statsWanted()) this.stats ??= new Stats(this);
    const ours = () => {
      if (this.streaming && this.walking) {
        const { pos } = this.walker;
        this.streamAround(Math.floor((pos.x + this.origin[0]) / TILE_FT), Math.floor((pos.z + this.origin[1]) / TILE_FT));
      }
      this.tick();
      this.sky.update(this.camera, performance.now() / 1000);
      setWaterTime(performance.now() / 1000);
      this.showSight();
      this.showClutter();
      this.hideParts();
    };
    const draw = () => this.renderer.render(this.scene, this.camera);
    if (this.stats) this.stats.measure(ours, draw);
    else {
      ours();
      draw();
    }
  }

  // Changes the clock: cycles (the time shown) or speed (how fast it moves on while walking).
  setTime(changes) {
    Object.assign(this.clock, changes);
    this.render();
  }

  // Moves the clock on while walking, and lights the scene and colors the sky for its time.
  tick() {
    const now = performance.now();
    const clock = this.clock;
    if (this.walking && clock.last !== null) clock.cycles += ((now - clock.last) * clock.speed) / CYCLE_MS;
    clock.last = now;
    const at = skyAt(clock.cycles);
    const look = this.sky.setTime(at);
    const light = (target, { color, intensity }) => {
      target.color.setRGB(...color, THREE.SRGBColorSpace);
      target.intensity = intensity;
    };
    light(this.sunLight, look.sun);
    this.sunLight.position.fromArray(at.sunDir);
    light(this.moonLight, look.moon);
    this.moonLight.position.fromArray(at.moonDir);
    light(this.ambient, look.sky);
    this.ambient.groundColor.setRGB(...look.ground, THREE.SRGBColorSpace);
    this.scene.background.setRGB(...look.bands[0], THREE.SRGBColorSpace);
    this.handlers.onTime?.(clock);
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
    setTreeSight(focus.x, focus.z, SIGHT.canopyFt, { band: SIGHT.canopyBandFt, solid: this.graphics.solidCanopies });
    const [tx, tz] = [Math.floor((focus.x + this.origin[0]) / TILE_FT), Math.floor((focus.z + this.origin[1]) / TILE_FT)];
    const near = (at) => !walking || !at || (Math.abs(at[0] - tx) <= SIGHT.tiles && Math.abs(at[1] - tz) <= SIGHT.tiles);
    this.showTreeStages(focus, near);
    this.far.visible = walking;
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
    this.showFar(tx, tz);
  }

  // The far ring around tile (tx, tz): tiles beyond the full 7×7 out to the 15×15, built when
  // they come into it and dropped when they leave.
  showFar(tx, tz) {
    const wanted = new Set();
    for (let dz = -SIGHT.farTiles; dz <= SIGHT.farTiles; dz++) {
      for (let dx = -SIGHT.farTiles; dx <= SIGHT.farTiles; dx++) {
        if (Math.abs(dx) > SIGHT.tiles || Math.abs(dz) > SIGHT.tiles) wanted.add(`${tx + dx},${tz + dz}`);
      }
    }
    for (const [key, meshes] of this.farTiles) {
      if (wanted.has(key)) continue;
      for (const mesh of meshes) {
        this.far.remove(mesh);
        if (mesh.isInstancedMesh) mesh.dispose();
        else mesh.geometry.dispose();
      }
      this.farTiles.delete(key);
    }
    for (const key of wanted) if (!this.farTiles.has(key)) this.farTiles.set(key, this.buildFar(key));
    // Walking from the map, the open sea leaves out every tile drawn, near or far.
    if (this.streaming) this.buildOcean([...this.streaming.built, ...[...this.farTiles].filter(([, m]) => m.length).map(([k]) => k)]);
  }

  // A far tile's meshes: coarse ground with a skirt to hide cracks against finer tiles, its water,
  // and stand-in trees. Its sea draws only where the open sea leaves the tile out.
  buildFar(key) {
    const tile = this.farTile(key);
    if (!tile) return [];
    const [tx, tz] = tile.coords;
    const at = (x, z) => this.decoded.get(`${x},${z}`) ?? this.farDecoded?.get(`${x},${z}`);
    const neighbours = { east: at(tx + 1, tz), south: at(tx, tz + 1), southEast: at(tx + 1, tz + 1) };
    const meshes = [new THREE.Mesh(geometry(terrainMesh(tile, neighbours, this.origin, SIGHT.farStep, { skirtFt: SIGHT.farSkirtFt })), this.terrainMaterial)];
    const ownSea = Boolean(this.streaming) || this.decoded.has(key);
    for (const kind of WATER_KINDS) {
      if (kind === "sea" && !ownSea) continue;
      const water = waterMesh(tile, neighbours, this.origin, kind);
      if (water) meshes.push(new THREE.Mesh(geometry(water), this.waterMaterials[kind]));
    }
    meshes.push(...treeMeshes(this.treesOf(tile), { far: true }));
    for (const mesh of meshes) this.far.add(mesh);
    return meshes;
  }

  // A tile for the far ring: one already decoded, else decoded now and kept while it's in the ring.
  farTile(key) {
    if (this.decoded.has(key)) return this.decoded.get(key);
    this.farDecoded ??= new Map();
    if (this.farDecoded.has(key)) return this.farDecoded.get(key);
    const [tx, tz] = key.split(",").map(Number);
    const bytes = this.world?.files.get(tilePath(this.continent, tx, tz));
    let tile = null;
    try {
      tile = bytes ? decodeTile(gunzipSync(bytes)) : null;
    } catch (err) {
      console.warn(`couldn't read tile ${key}: ${err.message}`);
    }
    this.farDecoded.set(key, tile);
    // Keep about the ring's worth, dropping the oldest.
    if (this.farDecoded.size > (SIGHT.farTiles * 2 + 3) ** 2) this.farDecoded.delete(this.farDecoded.keys().next().value);
    return tile;
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
    if (key === this.clutterAround) {
      if (this.clutterGathered && Math.hypot(focus.x - this.clutterGathered[0], focus.z - this.clutterGathered[1]) < CLUTTER_REGATHER_FT) return;
      this.gatherClutter(focus);
      return;
    }
    this.clutterAround = key;
    for (const child of [...this.clutter.children]) {
      child.dispose();
      this.clutter.remove(child);
    }
    const tileAt = (x, z) => this.decoded.get(`${x},${z}`);
    const near = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (tileAt(tx + dx, tz + dz)) near.push(`${tx + dx},${tz + dz}`);
    // None grows on structures' ground floors.
    const covered = structureCover(near.flatMap((k) => this.decoded.get(k).objects ?? []));
    const cell = STRUCTURE_CELL_FT;
    const instances = [];
    for (const k of near) {
      if (!this.clutterTiles.has(k)) this.clutterTiles.set(k, clutterForTile(this.decoded.get(k), tileAt));
      const list = this.clutterTiles.get(k);
      instances.push(...(covered.size ? list.filter((c) => !covered.has(`${Math.floor(c.x / cell)},${Math.floor(c.z / cell)}`)) : list));
    }
    if (instances.length) this.clutter.add(...clutterMeshes(instances, this.origin));
    this.gatherClutter(focus);
  }

  gatherClutter(focus) {
    this.clutterGathered = [focus.x, focus.z];
    const { clutterRadiusFt, clutterDensity } = this.graphics;
    gatherClutter(this.clutter.children, focus.x, focus.z, clutterRadiusFt + CLUTTER_REGATHER_FT, clutterDensity);
  }

  // Walk mode (walker.js): a character dropped at scene [x, z]. onStop
  // runs when it ends, however it ends.
  startWalk(onStop, at) {
    this.walker ??= new Walker(this, { onStop: () => this.walkStopped?.() });
    this.walkStopped = onStop;
    this.controls.enabled = false;
    this.walker.start(at);
  }

  stopWalk() {
    this.walker?.stop();
  }

  get walking() {
    return Boolean(this.walker?.active);
  }

  materials() {
    this.terrainMaterial ??= groundMaterial(this.renderer);
    this.waterMaterials ??= {
      sea: new THREE.MeshLambertMaterial({ color: SEA }),
      fresh: waterMaterial(this.renderer, { color: 0x3a78b8, opacity: 0.85 }),
    };
  }

  // A tile's ground and water meshes, from its decoded copy and its neighbours to the east and
  // south, which it reaches over to close the seams.
  buildGround(key) {
    const { decoded } = this;
    const tile = decoded.get(key);
    const [tx, tz] = key.split(",").map(Number);
    this.materials();
    const neighbours = {
      east: decoded.get(`${tx + 1},${tz}`),
      south: decoded.get(`${tx},${tz + 1}`),
      southEast: decoded.get(`${tx + 1},${tz + 1}`),
    };
    // Where structures' cellars open up, the ground's cut away.
    const cuts = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const key of tileWalk(decoded.get(`${tx + dx},${tz + dz}`)?.objects).cut) {
          const [x, z] = key.split(",").map((v) => Number(v) * STRUCTURE_CELL_FT);
          // The tile's mesh reaches a cell past its east and south edges, to close the seams.
          const within = (v, t) => v >= t * TILE_FT - STRUCTURE_CELL_FT && v < (t + 1) * TILE_FT + tile.cellFt;
          if (within(x, tx) && within(z, tz)) cuts.push([x - this.origin[0], z - this.origin[1]]);
        }
      }
    }
    const material = groundMaterial(this.renderer, { tile, neighbours, origin: this.origin, cuts, cutFt: STRUCTURE_CELL_FT });
    const terrain = new THREE.Mesh(geometry(terrainMesh(tile, neighbours, this.origin, 1)), material);
    terrain.userData.tile = [tx, tz];
    terrain.userData.ground = true;
    this.content.add(terrain);
    for (const kind of WATER_KINDS) {
      const water = waterMesh(tile, neighbours, this.origin, kind);
      if (!water) continue;
      const mesh = new THREE.Mesh(geometry(water), this.waterMaterials[kind]);
      mesh.userData.tile = [tx, tz];
      this.content.add(mesh);
    }
    for (const mesh of waterfallMeshes(tile.falls, this.origin, this.renderer)) {
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
    }
    this.ocean = new THREE.Mesh(oceanGeometry(keys, this.origin), this.waterMaterials.sea);
    this.content.add(this.ocean);
  }

  // Starts walking: the character starts at continent feet [x, z], and only the tiles around them
  // load, a tile farther than sight beyond what's drawn so seams close. They load and drop as the
  // character crosses tiles. state: { world, continent, zones }.
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
    [this.world, this.continent] = [state.world, state.continent];
    this.streaming = { world: state.world, continent: state.continent, at: null, built: new Set() };
    this.streamAround(tx, tz);
    this.showOutlines(state.zones);
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
        if (child.userData.ground) disposeGround(child.material);
      }
    }
  }

  addObjects(tile) {
    if (!tile.objects?.length) return;
    const tileAt = (x, z) => this.decoded.get(`${x},${z}`);
    // The structures around, for the objects inside them to stand on.
    const [tx, tz] = tile.coords;
    const near = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) near.push(...(tileAt(tx + dx, tz + dz)?.objects ?? []));
    for (const mesh of objectMeshes(tile.objects, tileAt, this.origin, tileWalk(near))) {
      mesh.userData.tile = tile.coords;
      this.objects.add(mesh);
    }
  }

  // A tile's trees, as a set of meshes per tile so whole tiles can be left out.
  addTrees(tile) {
    for (const mesh of treeMeshes(this.treesOf(tile))) {
      mesh.userData.tile = tile.coords;
      this.trees.add(mesh);
    }
  }

  // A tile's trees as treeMeshes takes them, in scene feet.
  treesOf(tile) {
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
    return trees;
  }

  // Every zone's outline, draped over the ground.
  showOutlines(zones) {
    empty(this.marks);
    for (const zone of zones) {
      for (const { points } of rings(zone.region)) this.marks.add(boundary(points, this.ground, this.origin, 0xffffff));
    }
    this.render();
  }

  clear() {
    for (const meshes of this.farTiles.values()) {
      for (const mesh of meshes) {
        if (mesh.isInstancedMesh) mesh.dispose();
        else mesh.geometry.dispose();
      }
    }
    this.far.clear();
    this.farTiles.clear();
    this.farDecoded = null;
    empty(this.content);
    this.ocean = null;
    for (const group of [this.trees, this.objects]) {
      for (const child of [...group.children]) {
        child.dispose();
        group.remove(child);
      }
    }
  }

  // --- pointer ---

}

function hasClipControl() {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ok = Boolean(gl?.getExtension("EXT_clip_control"));
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return ok;
}

// Disposes a group's children.
function empty(group) {
  for (const child of [...group.children]) {
    child.geometry.dispose();
    if (child.userData.ground) disposeGround(child.material);
    else child.material.dispose();
    group.remove(child);
  }
}

function geometry({ positions, colors, flows, depths, indices, skirt }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (colors) g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  if (flows) g.setAttribute("flow", new THREE.BufferAttribute(flows, 3));
  if (depths) g.setAttribute("depth", new THREE.BufferAttribute(depths, 1));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  // A skirt is lit like the ground at its top, so it doesn't show as a dark line.
  if (skirt) {
    const normal = g.attributes.normal;
    skirt.copies.forEach((v, n) => normal.setXYZ(skirt.from + n, normal.getX(v), normal.getY(v), normal.getZ(v)));
  }
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
export function groundSampler(decoded, origin) {
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
export function boundary(points, ground, origin, color, closed = true) {
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
