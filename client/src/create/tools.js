import * as THREE from "three";
import { Units } from "./units.js";
import { RestAreas } from "./restAreas.js";
import { CAVE_THEMES, VOXEL_FT } from "../v2/caves.js";
import { slabHome } from "../world/slabs.js";
import { SEA_LEVEL_FT } from "../v2/sizes.js";
import { Biomes } from "./biomes.js";
import { Courses } from "./courses.js";
import { Roads } from "./roads.js";
import { SHAPES } from "./geo.js";
import { EMPTY_FT } from "./ground.js";
import { isSlab } from "./placed.js";
import { AreaTool } from "./areaTool.js";
import { BRUSHES, BrushTool } from "./brushTool.js";
import { DrawTool } from "./drawTool.js";
import { PathTool } from "./pathTool.js";
import { MarkerTool, PinTool, SelectTool } from "./planningTools.js";
import { Marks } from "./marks.js";
import { MeasureTool } from "./measure.js";
import { CavePlan } from "./cavePlan.js";
import { CavePolish, TOOLS as POLISH_TOOLS } from "./cavePolish.js";
import { alert } from "./alerts.js";
import { THEME_LOOK } from "./caveMesh.js";
import { Build } from "./build.js";
import { PlayMap } from "../play/map.js";
import { MapPins } from "../v2/mapPins.js";
import { MapPinForm } from "./mapPinForm.js";
import { Paths } from "./paths.js";
import { TITLE_MAX } from "./pins.js";
import { WaterBodies } from "./water.js";

// The tools' sidebar: the type of work and its tools above, the picked tool's settings below. A
// picked tool takes the left button, and Esc puts it down. Each tool is worked by its own object,
// with down(e), move(e), up(e), key(e), which says whether it used the key, and setTool(tool),
// the tool picked of its own or null; dblclick(e) and tick(dt) if it has them:
// - geo's draw (drawTool.js), brushes (brushTool.js), and biomes, water, roads and courses, which
//   draw areas (areaTool.js), as units' rest areas do.
// - planning's marker, eraser (a brush), select and pin (planningTools.js), measure (measure.js)
//   and path (pathTool.js). Clicking a pin's head, with no tool or with pin, opens its title and
//   content to edit.
// - build's tools place objects, templates and slabs, and pick them to change (build.js).
// - units' tools place training dummies, rest points and the spawn (units.js).
// - caves' tools work on the network you're in, or were last in, shown in the panel above them.
//   Select is picked whenever no other is. Select, place entrance and, in layout, add lay out cave
//   networks (cavePlan.js); in polish, blocks, sculpt, smooth, flatten and paint edit a network's
//   rock by hand, the right button filling (cavePolish.js). Only the tools for the network's phase
//   show, and place entrance only works above the ground. Picking a tool picks how the rock's
//   drawn and whether the layout shows, which the panel can change after, and ` switches how it's
//   drawn. Each network has its own undo: undo undoes the current network's hand edits while it's
//   being polished, and its layout changes otherwise; switching phase isn't undone, and going back
//   to layout drops the hand edits' undos.
// This keeps what they share: where the pointer is and what it meets, and opening pins.

const PICK_FT = 30000; // how far off the pointer finds the ground
const BOX_PX = 4; // how far the pointer's dragged before measure's click is a drag
const PLANNING = new Set(["marker", "eraser", "select", "measure"]); // tools that work on lines drawn at sea level
const OPENS_PINS = new Set([null, "pin"]); // tools with which clicking a pin opens it
const BUILD = new Set(["pick", "object", "template", "slab", "stairs", "ramp"]);
const PLANS = new Set(["caveSelect", "entrance", "caveAdd"]);
const UNITS = new Set(["unitSelect", "dummy", "rest", "spawn"]);
const POLISH = new Set(POLISH_TOOLS);
const MEASURE = new Set(["measure"]);
// How each caves tool draws the rock and whether it shows the layout; null leaves it as it is.
const CAVE_VIEWS = {
  caveSelect: [null, true],
  entrance: ["finished", true],
  caveAdd: ["finished", true],
  caveBlocks: ["blocks", false],
  caveSculpt: ["blocks", false],
  caveSmooth: ["blocks", false],
  caveFlatten: ["blocks", false],
  cavePaint: ["finished", false],
};

const $ = (id) => document.getElementById(id);
// Draws a shape's profile into a thumbnail, across the way it's turned.
function drawShape(canvas, shape) {
  const g = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#c8b48a";
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x++) g.lineTo(x, h - 2 - SHAPES[shape](Math.abs((2 * x) / w - 1), (2 * x) / w - 1) * (h - 4));
  g.lineTo(w, h);
  g.fill();
}

export class Tools {
  constructor({ scene, camera, canvas, builder, renditions, ground, placed, things, library, caves, layout, inEarth }) {
    this.inEarth = inEarth;
    Object.assign(this, { camera, canvas, builder, renditions, ground, caves, layout, placed });
    this.tool = null;
    this.pointer = null; // normalized device coordinates, or null off the view
    const parent = canvas.parentElement;
    this.marks = new Marks(scene, (x, z) => this.surface(x, z), parent);
    this.measure = new MeasureTool(parent, canvas, () => this.hit(this.drawAt), BOX_PX);
    this.biomes = new Biomes(scene, (x, z) => this.surface(x, z), parent);
    this.biomesShown = false; // whether biome areas are shown with other tools too
    this.water = new WaterBodies(scene, (x, z) => this.surface(x, z), parent, (x, z) => renditions.heightAt(x, z) ?? EMPTY_FT);
    const stillAt = (x, z) => this.water.at(x, z)?.level ?? (renditions.seaAt(x, z) ? SEA_LEVEL_FT : null);
    this.courses = new Courses(scene, (x, z) => this.surface(x, z), parent, (x, z) => renditions.baseAt(x, z), stillAt);
    this.restAreas = new RestAreas(scene, (x, z) => this.surface(x, z), parent, () => this.units.here(this.units.restPoints));
    this.roads = new Roads(scene, (x, z) => this.surface(x, z), parent, (x, z) => renditions.baseAt(x, z));
    this.outlined = { biomes: this.biomes, water: this.water, courses: this.courses, roads: this.roads, restArea: this.restAreas }; // each tool that draws areas, its areas
    this.drawTool = new DrawTool(this, { scene, parent, renditions, ground, heightAt: (x, z) => renditions.heightAt(x, z) ?? EMPTY_FT, biomes: this.biomes });
    this.draw = this.drawTool.draw;
    this.build = new Build({
      scene,
      camera,
      canvas,
      placed,
      things,
      library,
      groundAt: (x, z) => renditions.heightAt(x, z) ?? EMPTY_FT,
      ray: () => {
        if (!this.pointer) return null;
        const ray = new THREE.Raycaster();
        ray.setFromCamera(this.pointer, this.camera);
        return ray;
      },
      groundHit: () => this.hit(),
      caveHit: () => this.caveHit(),
    });
    this.build.onPick = (tool) => this.tool !== tool && this.pick(tool);
    this.plan = new CavePlan({ scene, camera, canvas, layout, caves, ray: () => this.build.ray(), groundHit: () => this.hit(), groundAt: (x, z) => renditions.cellHeightAt(x, z) ?? EMPTY_FT, here: () => [builder.state.x, builder.state.y, builder.state.z] });
    builder.wheel = (e) => PLANS.has(this.tool) && this.plan.wheel(e);
    this.units = new Units({ scene, groundAt: (x, z) => renditions.heightAt(x, z) ?? EMPTY_FT, hit: () => this.hit(), ray: () => this.build.ray() });
    this.polish = new CavePolish({ scene, caves, layout, camera, ray: () => this.build.ray() });
    this.paths = new Paths(scene, parent, renditions, (x, z) => this.surface(x, z), (text) => ($("pathStatus").textContent = text));
    this.brush = new BrushTool(this, scene);
    this.marker = new MarkerTool(this);
    // The object that works each tool.
    this.workers = [
      [BUILD, this.build],
      [PLANS, this.plan],
      [UNITS, this.units],
      [POLISH, this.polish],
      [MEASURE, this.measure],
      [BRUSHES, this.brush],
      [new Set(["marker"]), this.marker],
      [new Set(["select"]), new SelectTool(this)],
      [new Set(["pin"]), new PinTool(this)],
      [new Set(["draw"]), this.drawTool],
      [new Set(["path"]), new PathTool(this, this.paths)],
      ...Object.entries(this.outlined).map(([tool, areas]) => [new Set([tool]), new AreaTool(this, tool, areas)]),
    ];
    this.older = new Set([this.build, this.plan, this.units, this.polish, this.measure]); // whose ticks take their own arguments
    $("caveUndo").addEventListener("click", () => this.caveUndo());
    for (const swatch of document.querySelectorAll("[data-rock] .create-swatch")) swatch.style.background = `rgb(${THEME_LOOK[CAVE_THEMES[Number(swatch.parentElement.dataset.rock)]].rgb.join(",")})`;
    this.caveViewButtons = [...document.querySelectorAll("[data-cave-view]")];
    for (const button of this.caveViewButtons) button.addEventListener("click", () => this.setCaveView(button.dataset.caveView, null));
    $("caveLayoutShown").addEventListener("change", () => this.setCaveView(null, $("caveLayoutShown").checked));
    // A thing under the ground in a cave network's chunk is that network's, and goes there only
    // while it's being polished.
    placed.caveOf = (thing) => {
      const [x, y, z] = isSlab(thing) ? slabHome(thing) : [thing.at[0], thing.y, thing.at[1]];
      return Number.isFinite(y) && y < (renditions.heightAt(x, z) ?? EMPTY_FT) ? caves.netAt(x, z) : null;
    };
    placed.caveProblem = (net) => (layout.locked(net) ? null : `${net} is still in layout; you can't add objects until it's being polished`);
    // Unlocking a network throws away its hand edits, and what's placed in it.
    this.plan.onUnlock = (net) => {
      this.polish.undos.delete(net);
      this.placed.dropCave(net);
    };
    // Planning's map: the continent as the map in play draws it, from the platters as they are,
    // with its map pins, put in, changed and taken away by clicking (mapPinForm.js).
    this.spawnPins = () => [];
    this.pinStore = new MapPins();
    this.pinForm = new MapPinForm(this.pinStore);
    this.map = new PlayMap({
      platters: () => [...renditions.platters.values()],
      roads: () => renditions.roadFile,
      at: () => ({ x: builder.state.x, z: builder.state.z, yaw: builder.state.yaw }),
      pins: () => this.spawnPins(),
      markers: () => this.pinStore.pins,
      onClick: (x, z, marker, screen) => this.pinForm.open(marker, [x, z], screen),
      key: false,
      onClose: () => {
        this.pinForm.close();
        if (this.tool === "map") this.pick(null);
      },
    });
    this.clicked = null; // a pin clicked with no tool or the pin tool, to open
    this.editing = null; // the pin open to edit, { pin, before }, before the planning file's JSON

    for (const thumb of document.querySelectorAll("#side canvas[data-shape]")) drawShape(thumb, thumb.dataset.shape);
    const pressed = (buttons, on) => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === on)));
    // Each type of work shows its own tools.
    const works = [...document.querySelectorAll(".create-work [data-work]")];
    this.works = works;
    this.work = null; // the type of work shown
    for (const button of works) {
      button.addEventListener("click", () => {
        pressed(works, button);
        this.work = button.dataset.work;
        for (const tools of document.querySelectorAll(".create-tools[data-work], .create-cave-system[data-work]")) tools.hidden = tools.dataset.work !== button.dataset.work;
        // A tool of another type of work is put down.
        if (this.tool && !document.querySelector(`.create-tools:not([hidden]) [data-tool="${this.tool}"]`)) this.pick(null);
        else if (!this.tool && this.work === "caves") this.pick(null);
      });
    }
    const toolButtons = [...document.querySelectorAll("[data-tool]")];
    for (const button of toolButtons) button.addEventListener("click", () => this.pick(this.tool === button.dataset.tool ? null : button.dataset.tool));
    this.bindPinEditing();
    $("marksUndo").addEventListener("click", () => this.marks.undo());

    canvas.addEventListener("pointermove", (e) => {
      this.point(e);
      this.worker()?.move(e);
    });
    canvas.addEventListener("pointerleave", () => (this.pointer = null));
    canvas.addEventListener("dblclick", (e) => this.worker()?.dblclick?.(e));
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button === 2 && POLISH.has(this.tool)) return this.polish.down(e);
      if (e.button !== 0) return;
      this.point(e);
      // Clicking away from an open pin only closes it. (The canvas's own handlers keep the browser
      // from closing it itself.)
      if (this.editing) return $("pinEdit").hidePopover();
      if (OPENS_PINS.has(this.tool)) {
        const r = canvas.getBoundingClientRect();
        const pin = this.marks.pins.pick(this.camera, r.width, r.height, e.clientX - r.left, e.clientY - r.top);
        // Opened when the button's let go, so letting it go doesn't close it again.
        if (pin) return (this.clicked = pin);
      }
      const worker = this.worker();
      if (!worker) return;
      if (worker.capture !== false) canvas.setPointerCapture(e.pointerId);
      worker.down(e);
    });
    canvas.addEventListener("pointerup", (e) => {
      if (this.clicked) {
        this.openPin(this.clicked);
        this.clicked = null;
        return;
      }
      this.worker()?.up(e);
    });
    window.addEventListener("keydown", (e) => {
      if (e.target.matches?.("input, textarea, select") || e.target.closest?.(":popover-open")) return;
      const worker = this.worker();
      if ((worker === this.plan || worker === this.polish) && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        this.caveUndo();
        return e.preventDefault();
      }
      // ` switches the caves' rock between finished and blocks.
      if (e.key === "`" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.setCaveView(this.caves.view === "blocks" ? "finished" : "blocks", null);
        return e.preventDefault();
      }
      if (worker?.key(e)) return e.preventDefault();
      if (e.key === "Escape") this.pick(null);
      else if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) this.hotkey(e.key.toLowerCase());
    });
    this.toolButtons = toolButtons;
  }

  // The pin popover's title, content and delete. A pin's changes are undone together, once it's
  // closed.
  bindPinEditing() {
    $("pinTitle").maxLength = TITLE_MAX;
    $("pinTitle").addEventListener("input", () => {
      this.editing.pin.title = $("pinTitle").value;
      this.marks.pins.relabel(this.editing.pin);
      this.marks.version++;
    });
    $("pinContent").addEventListener("input", () => {
      this.editing.pin.content = $("pinContent").value;
      this.marks.version++;
    });
    $("pinDelete").addEventListener("click", () => {
      const { pin, before } = this.editing;
      this.editing = null;
      this.marks.undos.push(before);
      this.marks.pins.remove(pin);
      this.marks.version++;
      $("pinEdit").hidePopover();
    });
    $("pinEdit").addEventListener("toggle", (e) => {
      if (e.newState !== "closed" || !this.editing) return;
      const { before } = this.editing;
      this.editing = null;
      if (JSON.stringify(before) !== JSON.stringify(this.marks.toJSON())) this.marks.undos.push(before);
    });
  }

  // Whether a brush stroke or a marker line is being drawn, so it isn't saved halfway.
  busy() {
    return Boolean(this.brush.stroke || this.marker.drawing);
  }

  // Shows biome areas' outlines with every tool, or only the biome tool.
  showBiomes(shown) {
    this.biomesShown = shown;
    this.biomes.setShown(shown || this.tool === "biomes");
  }

  // Opens a pin's title and content to edit, `before` the planning file's JSON before it was made.
  openPin(pin, before = this.marks.toJSON()) {
    this.editing = { pin, before };
    $("pinTitle").value = pin.title;
    $("pinContent").value = pin.content;
    $("pinEdit").showPopover();
    $(pin.title ? "pinContent" : "pinTitle").focus();
  }

  // A type of work's key (data-key) shows its tools, and a tool's, among those shown, picks it.
  hotkey(key) {
    const work = this.works.find((b) => b.dataset.key === key);
    if (work) return work.click();
    const tool = document.querySelector(`.create-tools:not([hidden]) [data-tool][data-key="${key}"]:not([hidden], [disabled])`);
    if (tool) this.pick(tool.dataset.tool);
  }

  // Undoes the current network's latest change: a hand edit while it's being polished, or else
  // a layout change.
  caveUndo() {
    const net = this.plan.current;
    const done = net && (this.layout.locked(net) ? this.polish.undo(net) : this.plan.undo(net));
    if (!done) alert(net ? `nothing to undo in ${net}` : "nothing to undo");
  }

  // Draws the caves' rock as `view`, "finished" or "blocks", and shows the layout or not
  // (`layout`); null leaves either as it is.
  setCaveView(view, layout) {
    if (view) {
      this.caves.setView(view);
      this.caveViewButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.caveView === view)));
    }
    if (layout !== null) {
      this.plan.shown = layout;
      $("caveLayoutShown").checked = layout;
    }
  }

  // The caves' panel and tools, as the current network is: only the tools for its phase, and
  // place entrance only above the ground.
  showCaves() {
    this.plan.showPanel();
    const phase = this.layout.networks.get(this.plan.current)?.phase ?? "layout";
    const { x, y, z } = this.builder.state;
    const under = y < (this.renditions.heightAt(x, z) ?? EMPTY_FT);
    for (const button of document.querySelectorAll('.create-tools[data-work="caves"] [data-tool]')) {
      button.hidden = Boolean(button.dataset.phase) && button.dataset.phase !== phase;
      button.disabled = button.dataset.tool === "entrance" && under;
    }
    const picked = document.querySelector(`.create-tools[data-work="caves"] [data-tool="${this.tool}"]`);
    if (picked && (picked.hidden || picked.disabled)) this.pick(null);
  }

  pick(tool) {
    // Caves' select is picked whenever no other caves tool is.
    if (!tool && this.work === "caves") tool = "caveSelect";
    this.tool = tool;
    this.toolButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
    for (const panel of document.querySelectorAll("[data-config]")) panel.hidden = !panel.dataset.config.split(" ").includes(tool ?? "none");
    for (const part of document.querySelectorAll("[data-only]")) part.hidden = !part.dataset.only.split(" ").includes(tool);
    for (const part of document.querySelectorAll("[data-not]")) part.hidden = part.dataset.not.split(" ").includes(tool);
    this.builder.paints = Boolean(tool);
    this.marks.unselect();
    this.marks.setFlat(PLANNING.has(tool));
    this.biomes.setShown(tool === "biomes" || this.biomesShown);
    this.water.setShown(tool === "water" || tool === "courses");
    this.courses.setShown(tool === "courses" || tool === "water");
    this.roads.setShown(tool === "roads");
    this.restAreas.setShown(tool === "restArea" || UNITS.has(tool));
    if (tool === "map") this.map.refresh();
    this.map.toggle(tool === "map");
    if (BUILD.has(tool) || BUILD.has(this.build.tool)) this.build.setTool(BUILD.has(tool) ? tool : null);
    for (const [tools, worker] of this.workers) if (worker !== this.build) worker.setTool(tools.has(tool) ? tool : null);
    if (CAVE_VIEWS[tool]) this.setCaveView(...CAVE_VIEWS[tool]);
  }

  // The object that works `tool`, or null.
  worker(tool = this.tool) {
    return this.workers.find(([tools]) => tools.has(tool))?.[1] ?? null;
  }

  point(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  // Where a line's point [x, z] is on the canvas, or the point `y` over it, in pixels, or null when
  // it's behind.
  onScreen([x, z], y = this.drawAt(x, z) + 1) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return v.z > 1 || v.z < -1 ? null : [((v.x + 1) / 2) * this.canvas.clientWidth, ((1 - v.y) / 2) * this.canvas.clientHeight];
  }

  // The surface the pointer finds at (x, z): the ground, or the sea over it.
  // From in a cave, where the pointer meets its rock, { at, ceiling, net, problem }: ceiling
  // where there's rock just over it and air just under it, net the network of the air it's
  // aimed through, and problem why things can't be placed there, or null where they can; or null.
  // Things go only in burned in networks.
  caveHit() {
    if (!this.pointer) return null;
    const { position: p } = this.camera;
    if (p.y >= (this.renditions.heightAt(p.x, p.z) ?? EMPTY_FT) || this.caves.solid(p.x, p.y, p.z)) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.pointer, this.camera);
    const at = this.caves.hit(ray.ray);
    if (!at) return null;
    const [x, y, z] = at;
    const way = ray.ray.direction.toArray();
    const [ax, ay, az] = at.map((v, k) => v - way[k] * 0.5);
    const net = this.caves.spans(Math.floor(ax / VOXEL_FT), Math.floor(az / VOXEL_FT))?.find((s) => s.floor <= ay && ay <= s.ceiling)?.net ?? null;
    const problem = net && !this.layout.locked(net) ? `${net} is still in layout; you can't add objects until it's being polished` : null;
    return { at, ceiling: this.caves.solid(x, y + 0.5, z) && !this.caves.solid(x, y - 0.5, z), net, problem };
  }

  surface(x, z) {
    return Math.max(this.renditions.heightAt(x, z) ?? EMPTY_FT, SEA_LEVEL_FT);
  }

  // Where the tool works at (x, z): sea level for lines being worked on, or the surface.
  drawAt = (x, z) => (this.marks.flat ? SEA_LEVEL_FT : this.surface(x, z));

  // Where the pointer meets the ground (or the sea), or `surface` given, [x, y, z], or null: from
  // over it or, in the earth, from under it.
  hit(surface = (x, z) => this.surface(x, z)) {
    if (!this.pointer) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.pointer, this.camera);
    const { origin, direction } = ray.ray;
    const side = origin.y < surface(origin.x, origin.z) ? -1 : 1;
    const above = (t) => {
      const [x, z] = [origin.x + direction.x * t, origin.z + direction.z * t];
      return side * (origin.y + direction.y * t - surface(x, z));
    };
    let [t0, t] = [0, 0];
    while (t < PICK_FT) {
      t0 = t;
      t += Math.max(2, t * 0.01);
      if (above(t) <= 0) break;
    }
    if (t >= PICK_FT || above(t) > 0) return null;
    for (let k = 0; k < 12; k++) {
      const mid = (t0 + t) / 2;
      if (above(mid) > 0) t0 = mid;
      else t = mid;
    }
    const p = origin.clone().addScaledVector(direction, t);
    return [p.x, p.y, p.z];
  }

  // Each frame: what each kind of thing shows, and the tool picked's own tick, but for the older
  // workers, whose ticks are called above as they need.
  tick(dt) {
    const { x: cx, y: cy, z: cz } = this.camera.position;
    const [w, h] = [this.canvas.clientWidth, this.canvas.clientHeight];
    const above = cy - this.surface(cx, cz);
    const ftPerPx = (Math.max(above, 50) * 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / h;
    this.marks.tick(dt, w, h, this.camera.position, above, ftPerPx);
    this.marks.pins.tick(this.camera, w, h);
    this.draw.tick(this.camera, w, h);
    this.paths.tick(this.camera, w, h);
    if (BUILD.has(this.tool)) this.build.tick();
    this.plan.tick(this.inEarth());
    this.polish.tick();
    if (this.work === "caves") this.showCaves();
    for (const [tool, areas] of Object.entries(this.outlined)) {
      const to = this.tool === tool && areas.draft && this.hit();
      areas.tick(dt, this.camera, w, h, to ? [to[0], to[2]] : null, this.tool === tool);
    }
    this.measure.tick(this.camera, w, h, this.tool === "measure");
    const worker = this.worker();
    if (!this.older.has(worker)) worker?.tick?.(dt);
  }
}
