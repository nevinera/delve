import * as THREE from "three";
import { setClutterRadius } from "../render/clutterMeshes.js";
import { RESOLUTIONS, SIGHT } from "../render/renderView.js";
import { HORIZON, Sky } from "../render/sky.js";
import { setTreeSight } from "../render/treeMeshes.js";
import { Walker } from "./walker.js";
import { clutterMeshes } from "../render/clutterMeshes.js";
import { Caves } from "../create/caves.js";
import { Layout } from "../create/caveLayout.js";
import { Clutter } from "../create/clutter.js";
import { Falls } from "../create/falls.js";
import { EMPTY_FT, FINE, Ground } from "../create/ground.js";
import { grid } from "../create/grid.js";
import { pressesOver } from "../create/press.js";
import { Scatter } from "../create/scatter.js";
import { Sea } from "../create/sea.js";
import { Things } from "../create/things.js";
import { WaterSurfaces } from "../create/waterSurface.js";
import { CYCLE_MS, cyclesAt, skyAt } from "../world/dayNight.js";
import { BIOME_NAMES } from "../v2/biomes.js";
import { SEA_LEVEL_FT, TILE_FT } from "../v2/sizes.js";
import { PlayGround } from "./ground.js";

// The play page's view of a version 2 world: the ground, water, trees, objects, slabs and caves as /create
// draws them (create/ground.js and the rest), its tiles near you in full and coarser further off,
// out to where the fog closes in, under the editor's sky, which passes through day and night as
// its walk mode's does. You walk as the editor's walker (play/walker.js), on the ground as the
// game server has it (ground.js). It has what the walker, the graphics panel, the game connection
// and others.js want of a RenderView. Positions are continent feet: `origin` is [0, 0].

// A whole day and night in 20 minutes, as the editor's walk mode has it.
const TIME_SPEED = CYCLE_MS / (20 * 60 * 1000);
const SEA_BELOW_FT = 2;
const DRAWN_FT = SIGHT.fogEndFt + TILE_FT; // how far off the ground's drawn: past the fog's end
const pixelRatio = (resolution) => Math.min(window.devicePixelRatio || 1, resolution === "full" ? 2 : resolution);

export class PlayView {
  constructor(canvas, handlers = {}) {
    Object.assign(this, { canvas, handlers });
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.graphics = { hidden: new Set(), resolution: "full", maxFps: 60, solidCanopies: false, clutterRadiusFt: 240, clutterDensity: 1 };
    this.renderer.setPixelRatio(pixelRatio(this.graphics.resolution));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(HORIZON);
    this.scene.fog = new THREE.Fog(HORIZON, SIGHT.fogStartFt, SIGHT.fogEndFt);
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, SIGHT.fogEndFt + 100);
    this.ambient = new THREE.HemisphereLight();
    this.sunLight = new THREE.DirectionalLight();
    this.moonLight = new THREE.DirectionalLight();
    this.scene.add(this.ambient, this.sunLight, this.moonLight, this.sunLight.target, this.moonLight.target);
    // The time the sky shows, as dayNight.js cycles: from the shared clock's, passing faster.
    this.clock = { cycles: cyclesAt(Date.now()), speed: TIME_SPEED, last: null };
    this.origin = [0, 0];
    // What the walker leaves the view's camera looking at when it stops.
    this.controls = { target: new THREE.Vector3(), update: () => {} };
    this.walker = null;
    this.last = null;
    grid.value = 0;
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  // Draws a continent from `renditions` (its platters added, its plates fetched as they're wanted),
  // `placed`, its slabs and objects, and its caves: `caves` a Caves its caves files are loaded into
  // as they come, and `caveLayout` its layout.json, or null.
  show(renditions, placed, caves, caveLayout = null) {
    const { scene, renderer } = this;
    this.renditions = renditions;
    this.placed = placed;
    renditions.pressesOver = (tx, tz) => pressesOver(placed.near((tx + 0.5) * TILE_FT, (tz + 0.5) * TILE_FT, TILE_FT).slabs, tx, tz);
    this.pressed = placed.version;
    this.ground = new Ground(scene, renditions, renderer, { farFt: DRAWN_FT, reachFt: DRAWN_FT });
    this.surfaces = new WaterSurfaces(scene, renditions, renderer, this.ground);
    this.sea = new Sea(scene, DRAWN_FT * 6, renditions, this.surfaces);
    this.scatter = new Scatter(scene, renditions);
    this.clutter = new Clutter(scene, renditions);
    this.falls = new Falls(scene, renditions, renderer);
    // The ground at caves' mouths is theirs to draw, with clutter round them as /create has it.
    this.caves = caves;
    const entrances = [...new Layout(caveLayout).entrances.values()];
    caves.entrances = () => entrances;
    caves.biomeAt = (x, z) => BIOME_NAMES[renditions.biomes.at(x, z)];
    caves.clutterMeshes = clutterMeshes;
    this.ground.holes = (tx, tz) => caves.holes(tx, tz);
    const groundRead = renditions.onRead;
    renditions.onRead = (key) => {
      groundRead(key);
      caves.groundRead(key);
    };
    caves.onMouths = (plates) => this.ground.refresh(plates);
    caves.groundMaterial = (tx, tz) => this.ground.fullMesh(tx, tz)?.material ?? null;
    this.things = new Things(scene, placed, (x, z, under) => caves.groundAt(x, z, under));
    this.walkGround = new PlayGround({ renditions, placed, things: this.things, scatter: this.scatter, caves });
    this.resize();
  }

  // Draws the land round continent feet [x, z] till it's ready to walk on there.
  async ready([x, z]) {
    const y = this.renditions.heightAt(x, z) ?? SEA_LEVEL_FT;
    this.camera.position.set(x, y + 30, z + 40);
    this.camera.lookAt(x, y, z);
    while (this.walkGround.groundAt(x, z) === null) {
      this.render([x, y, z]);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  // Walks from continent feet [x, z] as `look` (a resolved character recipe). onStop: when Escape
  // stops it.
  startWalk(onStop, at, look) {
    this.walker ??= new Walker(this, { onStop, ground: this.walkGround });
    if (look) this.walker.look = look;
    this.walking = true;
    this.walker.start(at);
  }

  // As the walker calls it, each frame: moves on what's drawn round where it's at, and draws.
  render(at = this.walker?.pos && [this.walker.pos.x, this.walker.pos.y, this.walker.pos.z]) {
    const now = performance.now();
    const dt = this.last === null ? 0 : Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.tick(now);
    if (at && this.ground) {
      const [x, y, z] = at;
      this.ground.update(x, y, z);
      this.sea.tick(x, SEA_LEVEL_FT - SEA_BELOW_FT, z);
      const near = this.ground.finest <= FINE;
      this.scatter.tick(dt, x, z, near);
      setTreeSight(x, z, SIGHT.canopyFt, { band: SIGHT.canopyBandFt, solid: this.graphics.solidCanopies });
      this.clutter.tick(dt, x, z, near);
      this.falls.tick(dt, x, z);
      if (this.placed.version !== this.pressed) {
        this.pressed = this.placed.version;
        this.ground.refresh(this.renditions.repress());
      }
      this.things.tick(x, z);
      this.caves.tick(x, z);
      this.surfaces.tick(dt, x, z, near);
    }
    this.sky.update(this.camera, now / 1000);
    this.hideParts();
    this.renderer.render(this.scene, this.camera);
  }

  // Moves the clock on while walking, and lights the scene and colors the sky for its time.
  tick(now) {
    const clock = this.clock;
    if (this.walking && clock.last !== null) clock.cycles += ((now - clock.last) * clock.speed) / CYCLE_MS;
    clock.last = now;
    const at = skyAt(clock.cycles);
    const look = this.sky.setTime(at);
    const light = (target, { color, intensity }) => {
      target.color.setRGB(...color, THREE.SRGBColorSpace);
      target.intensity = intensity;
    };
    // The lights shine from the sun and moon onto where the camera is.
    const { position } = this.camera;
    light(this.sunLight, look.sun);
    this.sunLight.position.fromArray(at.sunDir).multiplyScalar(1000).add(position);
    this.sunLight.target.position.copy(position);
    light(this.moonLight, look.moon);
    this.moonLight.position.fromArray(at.moonDir).multiplyScalar(1000).add(position);
    this.moonLight.target.position.copy(position);
    light(this.ambient, look.sky);
    this.ambient.groundColor.setRGB(...look.ground, THREE.SRGBColorSpace);
    this.scene.background.setRGB(...look.bands[0], THREE.SRGBColorSpace);
  }

  // Changes any of the graphics settings, as RenderView's: hidden (a set of its SCENE_PARTS),
  // resolution, maxFps, solidCanopies, clutterRadiusFt and clutterDensity.
  setGraphics(changes) {
    Object.assign(this.graphics, changes);
    setClutterRadius(this.graphics.clutterRadiusFt);
    this.renderer.setPixelRatio(pixelRatio(RESOLUTIONS.includes(this.graphics.resolution) ? this.graphics.resolution : "full"));
    this.resize();
    this.handlers.onGraphics?.(this.graphics);
  }

  // Leaves out what the settings hide: the distant land is the ground drawn coarser than in full.
  hideParts() {
    if (!this.ground) return;
    const far = !this.graphics.hidden.has("far ring");
    for (const kind of ["tile", "plate"]) if (this.ground.shown[kind] !== far) this.ground.toggle(kind);
    this.sky.mesh.visible = !this.graphics.hidden.has("sky");
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
