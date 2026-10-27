import { changedTiles } from "./changes.js";
import { FEATURE_HINTS, Features, PINS, ROADS, nextId } from "./features.js";
import { MapView } from "./mapView.js";
import { keyNav } from "./keyNav.js";
import { TileGenerator } from "./generation.js";
import { CHUNK, THUMB_PX } from "./thumbPixels.js";
import { Thumbnails, TileDetails, surfaceTiles, tilePath } from "./thumbnails.js";
import {
  cornerCount,
  labelPoint,
  nearestEdge,
  pointInRegion,
  resubtract,
  rings,
  snapToCell,
  subtractZones,
  tilesTouched,
} from "./region.js";
import { editedPath, loadEdited, saveEdited } from "./edited.js";
import { createZone, listZones, loadSketch, moveIntoSketch, olderZones, removeZone, saveSketch, saveZone, upgradeSketch } from "./zones.js";
import { ShapePalette } from "./shapePalette.js";
import { ShapePreview } from "./shapePreview.js";
import { WaterSimulator } from "./waterflow.js";
import { ROUTE_VERSION, RoadRouter, findCrossing, gradeCap } from "./roads.js";
import { hashString } from "../world/noise.js";
import { LandGrid, landBounds, loadLand, saveLand } from "../world/landGrid.js";
import { BLENDS, EROSIONS, SHAPES, TOOLS as SCULPT_TOOLS } from "./sculptTools.js";
import { DETAIL_TOOLS } from "./detailTools.js";
import { encodeTile } from "../world/tileCodec.js";
import { gzipSync } from "fflate";
import { CELL_FT, TILE_FT } from "../world/constants.js";
import { CYCLE_MS, LUNAR_DAYS, PHASES, cyclesAt, moonAge, phaseAt } from "../world/dayNight.js";

const HIT_PX = 8;
const COLORS = {
  active: "#f0c850",
  activeFill: "rgba(240, 200, 80, 0.06)",
  stale: "rgba(255, 130, 40, 0.45)",
  missing: "rgba(255, 255, 255, 0.16)",
  edited: "rgba(200, 120, 255, 0.9)",
  held: "rgba(230, 40, 60, 0.45)",
  locked: "rgba(255, 255, 255, 0.95)",
  casing: "rgba(0, 0, 0, 0.75)",
  lockedFill: "rgba(255, 255, 255, 0.07)",
};
const NAV = "drag or W A S D to pan · wheel or C/V to zoom";
// Steps drawn in 3d instead of on the map.
const IN_3D = new Set(["heights", "detail", "3d"]);
const HINTS = {
  detail: "left-drag to work the brush · the arrows off the window's sides move it a strip that way · 1-6 pick a tool · [ ] size · - = strength · right-drag turns · middle-drag pans · wheel zooms · ctrl-z undoes, ctrl-shift-z redoes",
  none: `pick a zone in the list or on the map to edit its region, or make a new one · ${NAV}`,
  empty: "draw the zone's region first",
  noLand: "raise some land on the heights step first",
  ...Object.fromEntries(
    SCULPT_TOOLS.map((tool) => [
      tool,
      `${{ stamp: "click to stamp the shape", ramp: "click where the ramp starts, then where it ends · esc drops it" }[tool] ?? `left-drag to ${{ set: "set the ground's height", erode: "wear the ground away" }[tool] ?? tool}`} · shift-drag smooths · ctrl turns the tool around · 1-9 and 0 pick a tool · [ ] size · - = strength · right-drag turns · middle-drag or W A S D pans · wheel or C/V zooms · ctrl-z undoes, ctrl-shift-z redoes`,
    ]),
  ),
  ...FEATURE_HINTS,
  tiles: `highlighted tiles are out of date, or not generated yet (faint) · generate brings them all up to date · ${NAV}`,
  "3d": "drag to turn · right-drag or W A S D to pan · wheel or C/V to zoom · Q/E turn",
};
const HINT_WALK = "W/S run · A/D turn · Q/E strafe · space jumps · / walks · X sits · Z sprints · left-drag looks around · right-drag turns · wheel zooms · esc stops walking";
const HINT_PICK_WALK = "click where to start walking · esc cancels";

// The editor's steps, in the order you'd usually work, each with its own map and tools. Each step
// is a layer that depends only on the ones before it: the land's heights, then the water that
// runs over them, then the biomes that grow along it, then civilization on top, then the zones
// that divide it all up. The heights step sculpts the land grid in 3d (sculptView.js); the zones
// step edits one zone's region at a time; the rest edit the continent's sketch, the pins and paths
// drawn anywhere on its land. `map` is what the step draws under its marks: a live preview worked
// out from the land (shapePreview.js), or the generated tiles.
const STEPS = {
  heights: { tools: SCULPT_TOOLS, kinds: [] },
  water: { tools: ["select", "source"], kinds: ["source"], map: "heights" },
  biomes: { tools: ["select", "biome"], kinds: ["biome"], map: "biomes" },
  civilization: { tools: ["select", ...Object.keys(ROADS), "hub", "info"], kinds: ["road", "hub", "info"] },
  zones: { tools: [], kinds: [], map: "heights" },
  tiles: { tools: [], kinds: [], map: "tiles" },
  detail: { tools: DETAIL_TOOLS, kinds: [] },
  "3d": { tools: [], kinds: [] },
};
// With this many tiles in sight or more, tiles draw as their thumbnails instead of close up.
const DETAIL_MAX_TILES = 128;
// Past this many screen pixels per pixel of the small thumbnails, tiles draw their full ones.
const FULL_THUMB_ZOOM = 1.5;
const PREVIEW_DELAY_MS = 80; // after panning or zooming stops, before the preview is redone
const PREVIEW_MARGIN = 0.15; // of the view's size, worked out beyond each edge
const PREVIEW_PX = 3; // screen pixels per preview sample
const ROUTE_SAVE_DELAY_MS = 100; // routes arriving together are kept together
const MAX_CROSSINGS = 50; // joined at once
const CROSSING_GAP_FT = 16; // nearer a route's end than this, a crossing is left alone

// Ties the map, the side panel and the in-memory world together. The side panel lists the steps,
// with only the one you're on open.
export class Editor {
  constructor(world, elements) {
    this.world = world;
    this.el = elements;
    this.continent = world.info.continents[0].key;
    this.zones = [];
    this.sketch = loadSketch(world, this.continent);
    this.active = null; // the zone picked on the zones step
    this.drawing = null; // corners of a region being drawn
    this.step = "heights";
    this.toolName = "raise";
    this.features = new Features(this);
    this.palette = new ShapePalette(this, elements);
    this.unsaved = false; // changed since the last download

    this.map = new MapView(elements.map, {
      onPointer: ([x, z]) => (elements.cursor.textContent = `tile ${Math.floor(x)}, ${Math.floor(z)}`),
      drawBase: (ctx, map) => this.drawBase(ctx, map),
      draw: (ctx, map) => this.draw(ctx, map),
      tool: () => this.tool(),
      onView: () => this.viewChanged(),
    });

    this.thumbnails = new Thumbnails({
      onProgress: () => {
        this.map.render();
        if (this.step === "3d") this.overview?.thumbsChanged();
      },
      onSaved: () => this.onEdit?.(),
      near: () => [this.map.view.x, this.map.view.z],
    });
    this.details = new TileDetails(
      (tx, tz) => this.world.files.get(tilePath(this.continent, tx, tz)),
      () => this.map.render(),
    );
    this.generator = new TileGenerator();
    this.generating = false;
    this.pending = new Set(); // "x,z" keys of generated tiles whose sketch changed since
    this.previews = new ShapePreview((grid) => this.showPreview(grid));
    this.preview = null; // the latest heights or biomes picture: { step, canvas, grid }
    this.water = new WaterSimulator((key, result) => this.showWater(key, result));
    this.waterKey = null; // what the latest watercourses asked for were worked out from
    this.roads = new RoadRouter((id, key, route) => this.showRoute(id, key, route));
    this.roadLand = null; // what the paths' routes are worked out over, as a key
    this.roadAsk = null; // the latest routes asked for
    this.view3d = null; // the RenderView for walking, loaded the first time you walk
    this.overview = null; // the 3d step's Overview, loaded the first time it's opened
    this.sculpt = null; // the heights step's SculptView, loaded the first time it's opened
    this.land = new LandGrid(); // the continent's land grid, as it's being sculpted
    this.landKey = null; // the land grid's hash, worked out when needed
    this.landDirty = false; // sculpted since the land was last committed
    this.bindPanel();
    this.fillContinents();
    window.addEventListener("keydown", (e) => this.onKey(e));
    noContextMenu(elements.map.parentElement);
    keyNav((dt, move) => {
      if (this.step === "3d") this.overview?.nudge(dt, move);
      else if (this.step === "heights") this.sculpt?.nudge(dt, move);
      else if (!this.walking) this.map.nudge(dt, move);
    });
    this.showContinent();
    this.setStep(this.step);
  }

  // Whether the world changed since the last download. Setting it runs onEdit, so the world can be
  // kept somewhere as it changes.
  get dirty() {
    return this.unsaved;
  }

  set dirty(value) {
    this.unsaved = value;
    if (value) this.onEdit?.();
  }

  // Swaps in a different world, such as an uploaded one.
  setWorld(world) {
    this.world = world;
    this.continent = world.info.continents[0]?.key;
    this.active = null;
    this.drawing = null;
    this.features.select(null);
    this.dirty = false;
    this.pending.clear();
    this.fillContinents();
    this.showContinent();
  }

  // Loads the current continent's thumbnails, zones and sketch, and frames them. Zones that held
  // their own pins hand them over to the sketch.
  showContinent() {
    this.thumbnails.load(this.world, this.continent);
    this.details.clear();
    this.preview = null;
    const moved = moveIntoSketch(this.world, this.continent);
    if (moved.length) this.dirty = true;
    this.waterKey = null;
    this.reload();
    const dropped = upgradeSketch(this.sketch);
    if (this.sketch.version !== loadSketch(this.world, this.continent).version) this.saveSketch();
    const older = olderZones(this.world, this.continent);
    const notes = [
      moved.length && `Moved the pins of ${moved.join(", ")} into the continent's sketch.`,
      dropped.rivers && `Dropped ${dropped.rivers} hand-drawn river${dropped.rivers === 1 ? "" : "s"}; place water sources instead.`,
      dropped.roads && `Dropped ${dropped.roads} road${dropped.roads === 1 ? "" : "s"} drawn as lines; place road pins instead.`,
      older.length && `Skipped zones in an older format: ${older.join(", ")}.`,
    ];
    this.say(notes.filter(Boolean).join(" "), { info: true });
    this.fitContinent();
    if (this.step === "3d") this.showOverview();
    if (this.step === "heights") this.showSculpt();
  }

  fillContinents() {
    const select = this.el.continent;
    select.innerHTML = "";
    for (const c of this.world.info.continents) select.add(new Option(c.name, c.key));
    select.value = this.continent;
  }

  // Frames the continent's tiles, land and zones.
  fitContinent() {
    const land = landBounds(this.land);
    const points = [
      ...surfaceTiles(this.world, this.continent).flatMap(({ tx, tz }) => [[tx, tz], [tx + 1, tz + 1]]),
      ...this.zones.flatMap((z) => rings(z.region).flatMap((r) => r.points)),
      ...(land ? [land.slice(0, 2), land.slice(2)].map((p) => p.map((v) => v / TILE_FT)) : []),
    ];
    if (!points.length) return;
    const xs = points.map((p) => p[0]);
    const zs = points.map((p) => p[1]);
    this.map.fit([Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]);
  }

  get activeZone() {
    return this.zones.find((z) => z.key === this.active) ?? null;
  }

  // The zone edits are limited to: the one picked, on the zones step.
  get editZone() {
    return this.step === "zones" ? this.activeZone : null;
  }

  // Every tile with committed land above deep ocean, as a set of "tx,tz" keys.
  landTiles() {
    this.landTileKeys ??= loadLand(this.world.files, this.continent).tiles();
    return this.landTileKeys;
  }

  // Whether anything's been raised, committed or not.
  hasLand() {
    return this.land.blocks.size > 0;
  }

  // The land grid's hash, kept until it changes.
  landHash() {
    this.landKey ??= this.land.hash();
    return this.landKey;
  }

  // Land tiles that need generating: { stale } ones generated before a change that reaches them,
  // and { missing } ones never generated. Both are lists of "tx,tz" keys.
  // The tiles to generate: stale (changed since generated) and missing ones, and held ones, stale
  // but edited by hand, which are only regenerated when asked.
  outOfDate() {
    const stale = [];
    const missing = [];
    const held = [];
    const edited = this.editedTiles();
    for (const key of this.landTiles()) {
      const [tx, tz] = key.split(",").map(Number);
      if (!this.world.files.has(tilePath(this.continent, tx, tz))) missing.push(key);
      else if (this.pending.has(key)) (edited.has(key) ? held : stale).push(key);
    }
    return { stale, missing, held };
  }

  // The continent's hand-edited tiles (edited.js), read again when the file changes.
  editedTiles() {
    const bytes = this.world.files.get(editedPath(this.continent));
    if (this.editedCache?.bytes !== bytes || this.editedCache?.continent !== this.continent) this.editedCache = { bytes, continent: this.continent, keys: loadEdited(this.world.files, this.continent) };
    return this.editedCache.keys;
  }

  // Marks tiles ("tx,tz" keys) edited by hand, or not.
  setEdited(keys, edited) {
    const all = new Set(this.editedTiles());
    for (const key of keys) {
      if (edited) all.add(key);
      else all.delete(key);
    }
    saveEdited(this.world.files, this.continent, all);
    this.dirty = true;
  }

  // The zone whose region holds a point, if any.
  zoneAt(point) {
    return this.zones.find((z) => z.region.length && this.inRegion(point, z)) ?? null;
  }

  // Whether a point (tile units) is on land, above sea level.
  onLand([x, z]) {
    return this.land.heightAt(x * TILE_FT, z * TILE_FT) >= 0;
  }

  // The continent as the generator takes it (generator.js prepareWorld).
  continentState() {
    const { pins, paths, watercourses } = this.sketch;
    return { land: this.land.data, pins, paths, watercourses };
  }

  // The continent as last stored, from the world's files.
  storedState() {
    const { pins, paths, watercourses } = loadSketch(this.world, this.continent);
    return { land: loadLand(this.world.files, this.continent), pins, paths, watercourses };
  }

  reload() {
    this.zones = listZones(this.world, this.continent);
    this.sketch = loadSketch(this.world, this.continent);
    this.land = loadLand(this.world.files, this.continent);
    this.landTileKeys = null;
    this.landKey = null;
    this.landDirty = false;
    if (!this.activeZone) this.active = null;
    this.renderPanel();
    this.renderProps();
    this.map.render();
    this.updatePreview();
  }

  // Stores the zone, and marks the generated tiles the edit changes as out of date.
  save(zone) {
    this.store(() => saveZone(this.world, this.continent, zone));
  }

  // Stores the sketch, the same way.
  saveSketch() {
    this.store(() => saveSketch(this.world, this.continent, this.sketch));
  }

  // The land's been sculpted: the water and roads follow it, but tiles wait for a commit.
  landChanged() {
    this.landKey = null;
    this.landDirty = true;
    this.renderPanel();
  }

  // Stores the land grid as sculpted, and marks the generated tiles it changes as out of date.
  commitLand() {
    this.landDirty = false;
    this.store(() => saveLand(this.world.files, this.continent, this.land));
  }

  // Swaps in land from a heightmap or a bones file, uncommitted, and looks at it.
  async replaceLand(land) {
    this.land = land;
    this.landChanged();
    // The map's hidden on the heights step, so it's fitted to the land when it's next shown.
    this.fitWhenShown = true;
    await this.showSculpt();
    const bounds = landBounds(land);
    if (bounds) this.sculpt.lookOver(bounds);
  }

  // Puts the land back as it was last committed.
  discardLand() {
    this.land = loadLand(this.world.files, this.continent);
    this.landKey = null;
    this.landDirty = false;
    this.renderPanel();
    this.showSculpt();
  }

  store(write) {
    const before = this.storedState();
    write();
    this.landTileKeys = null;
    const tiles = this.landTiles();
    const edited = this.editedTiles();
    let touched = 0;
    for (const tile of changedTiles(before, this.storedState(), tiles)) {
      if (!tiles.has(tile)) continue;
      if (edited.has(tile) && !this.pending.has(tile)) touched++;
      this.pending.add(tile);
    }
    if (touched) this.say(`That affects ${touched} manually edited tile${touched === 1 ? "" : "s"}, marked in red. Generating leaves them as they are unless you allow it.`);
    this.dirty = true;
    this.renderPanel();
    this.map.render();
    this.updatePreview();
  }

  // --- water ---

  // Works out the watercourses again when the land or the water sources changed since they were
  // last worked out. They're kept in the sketch when they arrive, unless something's being dragged,
  // in which case they're kept when the drag ends.
  updateWater() {
    const sources = this.sketch.pins.filter((p) => p.kind === "source").map(({ id, at, width }) => ({ id, at, width }));
    const landKey = String(this.landHash());
    const key = String(hashString(JSON.stringify([landKey, sources, this.continent])));
    if (key === this.waterKey) return;
    this.waterKey = key;
    this.water.request({ key, landKey, continent: { land: this.land.data }, seedKey: this.continent, sources });
  }

  showWater(key, { rivers, pools, ends }) {
    if (key !== this.waterKey) return;
    this.waterEnds = ends;
    this.renderWaterStatus();
    if (this.sketch.watercourses.key === key) return;
    this.sketch.watercourses = { key, rivers, pools };
    if (this.features.dragging) this.map.render();
    else this.saveSketch();
  }

  // A line under a water source's settings saying where its water ends up.
  sourceStatus(pin) {
    this.waterStatus = { pin, el: document.createElement("p") };
    this.renderWaterStatus();
    return this.waterStatus.el;
  }

  renderWaterStatus() {
    const { pin, el } = this.waterStatus ?? {};
    if (!el) return;
    const ends = {
      water: "Its water reaches the sea.",
      pool: "Its water fills a pool as far as its flow allows, and stops there.",
      flat: "Its water spreads out over flat ground.",
      lost: "Its water wanders too far, and has been cut short.",
    };
    el.textContent = ends[this.waterEnds?.[pin.id]] ?? "Working out where its water goes…";
  }

  // --- roads ---

  // Asks for routes for the paths whose route is missing or was worked out for other pins, widths
  // or land. The land they're routed over is the land grid, biome pins and watercourses.
  updateRoads() {
    const { pins, watercourses } = this.sketch;
    const land = { land: this.land.data, pins: pins.filter((p) => p.kind === "biome"), watercourses: { rivers: watercourses.rivers, pools: watercourses.pools } };
    this.roadLand = String(hashString(JSON.stringify([this.landHash(), land.pins, land.watercourses, this.continent])));
    const jobs = this.sketch.paths.flatMap((path) => {
      const key = this.routeKey(path);
      if (!key || path.route?.key === key) return [];
      const at = (id) => this.sketch.pins.find((p) => p.id === id).at;
      return [{ id: path.id, key, from: at(path.from), to: at(path.to), width: path.width }];
    });
    const ask = JSON.stringify(jobs.map((j) => j.key));
    if (!jobs.length || ask === this.roadAsk) return;
    this.roadAsk = ask;
    this.roads.request({ landKey: this.roadLand, continent: land, seedKey: this.continent, jobs });
  }

  // What a path's route is worked out from, as a key: its pins, its grade cap and the land.
  routeKey(path) {
    const at = (id) => this.sketch.pins.find((p) => p.id === id)?.at;
    const [from, to] = [at(path.from), at(path.to)];
    if (!from || !to) return null;
    return String(hashString(JSON.stringify([ROUTE_VERSION, this.roadLand, from, to, gradeCap(path.width)])));
  }

  // Keeps a route that's still wanted, and once the routes in hand are kept, puts road pins where
  // paths cross. While something's being dragged, it's kept when the drag ends.
  showRoute(id, key, route) {
    const path = this.sketch.paths.find((p) => p.id === id);
    if (!path || this.routeKey(path) !== key) return;
    path.route = { key, ...route };
    this.features.renderStatus();
    this.map.render();
    if (this.features.dragging) return;
    clearTimeout(this.routeTimer);
    this.routeTimer = setTimeout(() => {
      if (this.features.dragging) return;
      this.joinCrossings();
      this.saveSketch();
    }, ROUTE_SAVE_DELAY_MS);
  }

  // Where two paths' routes cross, a road pin, splitting both paths there. Returns how many it
  // put.
  joinCrossings() {
    let n = 0;
    for (; n < MAX_CROSSINGS; n++) {
      const routed = this.sketch.paths.filter((p) => this.features.pathState(p) === "routed").map((p) => ({ ...p, points: p.route.points }));
      const crossing = findCrossing(routed, CROSSING_GAP_FT / TILE_FT);
      if (!crossing) break;
      const pin = { id: nextId(this.sketch, "p"), kind: "road", at: snapToCell(crossing.point) };
      this.sketch.pins.push(pin);
      const path = (id) => this.sketch.paths.find((p) => p.id === id);
      const [a, b] = [path(crossing.a), path(crossing.b)];
      this.features.splitPath(this.sketch, a, crossing.ia, pin);
      this.features.splitPath(this.sketch, b, crossing.ib, pin);
    }
    return n;
  }

  // --- walking ---

  get walking() {
    return Boolean(this.view3d?.walking);
  }

  // Starts walking at continent tile units [x, z], in a 3D view that loads only the tiles around
  // the walker, and goes back to the map after.
  async walkAt([x, z]) {
    this.walkPicking = false;
    if (!this.world.files.has(tilePath(this.continent, Math.floor(x), Math.floor(z)))) {
      this.say("Generate the tiles here before walking on them.");
      this.renderPanel();
      return;
    }
    if (!this.view3d) {
      const { RenderView, SCENE_PARTS, RESOLUTIONS, CLUTTER_RADIUS_FT } = await import("./renderView.js");
      this.view3d = new RenderView(this.el.scene, { onGraphics: (graphics) => this.showGraphics?.(graphics), onTime: (clock) => this.showTime?.(clock) });
      this.buildGraphics(SCENE_PARTS, RESOLUTIONS, CLUTTER_RADIUS_FT);
      this.buildTime();
    }
    this.el.map.hidden = true;
    this.el.scene.hidden = false;
    this.say();
    this.view3d.walkFrom({ world: this.world, continent: this.continent, zones: this.zones }, [x * TILE_FT, z * TILE_FT], () => {
      this.el.scene.hidden = true;
      this.el.map.hidden = false;
      this.map.resize();
      this.renderPanel();
    });
    this.renderPanel();
  }

  // The graphics popover: a radio button for each resolution, a checkbox for each part of the
  // scene, solid canopies, and sliders for ground clutter's radius and density. They change the 3D
  // view's settings, and follow changes made elsewhere, like the stats overlay's keys.
  buildGraphics(parts, resolutions, clutterRadiusFt) {
    const { graphicsResolution, graphicsParts, solidCanopies, clutterRadius, clutterDensity } = this.el;
    const check = (type, name, label) => {
      const el = document.createElement("label");
      el.className = "editor-check";
      el.innerHTML = `<input type="${type}" name="${name}"><span></span>`;
      el.querySelector("span").textContent = label;
      return el;
    };
    for (const r of resolutions) graphicsResolution.append(check("radio", "graphicsResolution", r === "full" ? "full" : `${r}x`));
    for (const p of parts) graphicsParts.append(check("checkbox", "graphicsPart", p));
    const inputs = (el) => [...el.querySelectorAll("input")];
    inputs(graphicsResolution).forEach((input, i) => input.addEventListener("change", () => this.view3d.setGraphics({ resolution: resolutions[i] })));
    inputs(graphicsParts).forEach((input, i) =>
      input.addEventListener("change", () => {
        const { hidden } = this.view3d.graphics;
        if (input.checked) hidden.delete(parts[i]);
        else hidden.add(parts[i]);
        this.view3d.setGraphics({ hidden });
      }),
    );
    solidCanopies.addEventListener("change", () => this.view3d.setGraphics({ solidCanopies: solidCanopies.checked }));
    Object.assign(clutterRadius, clutterRadiusFt);
    clutterRadius.addEventListener("input", () => this.view3d.setGraphics({ clutterRadiusFt: Number(clutterRadius.value) }));
    clutterDensity.addEventListener("input", () => this.view3d.setGraphics({ clutterDensity: Number(clutterDensity.value) / 100 }));
    this.showGraphics = ({ resolution, hidden }) => {
      inputs(graphicsResolution).forEach((input, i) => (input.checked = resolutions[i] === resolution));
      inputs(graphicsParts).forEach((input, i) => (input.checked = !hidden.has(parts[i])));
      solidCanopies.checked = this.view3d.graphics.solidCanopies;
      clutterRadius.value = this.view3d.graphics.clutterRadiusFt;
      clutterDensity.value = Math.round(this.view3d.graphics.clutterDensity * 100);
      this.el.clutterRadiusValue.textContent = `${clutterRadius.value} ft`;
      this.el.clutterDensityValue.textContent = `${clutterDensity.value}%`;
    };
    this.showGraphics(this.view3d.graphics);
    // So keys go back to walking and the stats overlay.
    this.el.graphics.addEventListener("change", (e) => e.target.blur());
    placeUnder(this.el.graphics, this.el.graphicsButton);
  }

  // The time popover: sliders for the time of day, the day of the moon's month and how fast time
  // passes while walking, and a button back to the shared clock's time. Its button names the part
  // of the day.
  buildTime() {
    const { timeButton, timePanel, timeOfDay, timeOfDayValue, moonDay, moonDayValue, timeSpeed, timeSpeedValue, timeNow } = this.el;
    const view = this.view3d;
    moonDay.max = LUNAR_DAYS - 1;
    const day = () => Math.floor(view.clock.cycles);
    timeOfDay.addEventListener("input", () => view.setTime({ cycles: day() + Number(timeOfDay.value) }));
    moonDay.addEventListener("input", () => {
      const { cycles } = view.clock;
      const month = Math.floor(cycles / LUNAR_DAYS) * LUNAR_DAYS;
      view.setTime({ cycles: month + Number(moonDay.value) + (cycles - Math.floor(cycles)) });
    });
    timeSpeed.max = TIME_SPEEDS.length - 1;
    timeSpeed.addEventListener("input", () => view.setTime({ speed: TIME_SPEEDS[timeSpeed.value] }));
    timeNow.addEventListener("click", () => view.setTime({ cycles: cyclesAt(Date.now()) }));
    let shown = "";
    this.showTime = ({ cycles, speed }) => {
      const { phase, left } = timeLabel(cycles);
      const moon = MOON_NAMES[Math.floor(moonAge(cycles) * MOON_NAMES.length)];
      const label = `${phase}|${left}|${moon}|${speed}`;
      if (label === shown) return;
      shown = label;
      timeButton.textContent = phase;
      timeOfDayValue.textContent = `${phase}, ${left} left`;
      moonDayValue.textContent = moon;
      if (document.activeElement !== timeOfDay) timeOfDay.value = cycles - Math.floor(cycles);
      if (document.activeElement !== moonDay) moonDay.value = ((Math.floor(cycles) % LUNAR_DAYS) + LUNAR_DAYS) % LUNAR_DAYS;
      timeSpeedValue.textContent = speedLabel(speed);
      if (document.activeElement !== timeSpeed) timeSpeed.value = nearestSpeed(speed);
    };
    this.showTime(view.clock);
    timePanel.addEventListener("change", (e) => e.target.blur());
    placeUnder(timePanel, timeButton);
  }

  // --- steps and options ---

  // Opens a step, with its first tool.
  setStep(step) {
    this.step = step;
    this.toolName = STEPS[step].tools[0] ?? "select";
    this.drawing = null;
    this.features.select(null);
    this.say();
    this.renderPanel();
    this.el.map.hidden = IN_3D.has(step);
    this.el.overview.hidden = step !== "3d";
    this.el.sculpt.hidden = step !== "heights";
    this.el.detail.hidden = step !== "detail";
    if (step === "detail") this.showDetail();
    else this.detail?.hide();
    if (step === "3d") this.showOverview();
    else this.overview?.hide();
    if (step === "heights") this.showSculpt();
    else this.sculpt?.hide();
    if (this.fitWhenShown && !this.el.map.hidden) {
      this.fitWhenShown = false;
      this.map.resize();
      this.fitContinent();
    }
    this.map.render();
    this.updatePreview();
  }

  // The 3d step: the continent's generated ground, seen from above.
  async showOverview() {
    this.overviewLoading ??= import("./overview.js").then(({ Overview }) => {
      this.overview = new Overview(this.el.overview, {
        thumbs: this.thumbnails,
        onProgress: (read, total) => (this.el.overviewInfo.textContent = read < total ? `reading heights: ${read} of ${total} tiles` : `${total} tiles`),
      });
    });
    await this.overviewLoading;
    if (this.step === "3d") this.overview.show(this.world, this.continent, [this.map.view.x, this.map.view.z]);
  }

  // The detail step: a window of generated tiles in 3d, `detailSize` a side, first round the
  // middle of the map.
  async showDetail() {
    this.detailLoading ??= import("./detailView.js").then(({ DetailView, WINDOW_SIZES }) => {
      for (const size of WINDOW_SIZES) this.el.detailSize.add(new Option(`${size} × ${size} tiles`, size));
      this.el.detailSize.addEventListener("change", () => {
        const size = Number(this.el.detailSize.value);
        const { tx0, tz0, size: was } = this.detailWindow;
        // Grows and shrinks about the same middle.
        const shift = Math.floor((was - size) / 2);
        this.detailWindow = { tx0: tx0 + shift, tz0: tz0 + shift, size };
        this.showDetail();
      });
      this.detail = new DetailView(this.el.detail, {
        onMove: (dx, dz) => {
          this.detailWindow.tx0 += dx;
          this.detailWindow.tz0 += dz;
          this.showDetail();
        },
        onEdit: (keys) => this.saveDetail(keys),
        onPointer: (hit) => this.showCursor(hit),
      });
      this.applyDetailBrush();
    });
    await this.detailLoading;
    if (this.step !== "detail") return;
    this.applyDetailBrush();
    if (!this.detailWindow) {
      const size = Number(this.el.detailSize.value) || 3;
      this.detailWindow = { tx0: Math.floor(this.map.view.x) - Math.floor(size / 2), tz0: Math.floor(this.map.view.z) - Math.floor(size / 2), size };
    }
    const { tx0, tz0, size } = this.detailWindow;
    this.el.detailSize.value = size;
    this.detail.show({ world: this.world, continent: this.continent }, [tx0, tz0], size);
    const loaded = this.detail.keys().filter((k) => this.detail.view.decoded.has(k)).length;
    this.el.detailInfo.textContent = `tiles ${tx0},${tz0} to ${tx0 + size - 1},${tz0 + size - 1} · ${loaded} of ${size * size} generated`;
  }

  // Where the pointer is on a 3d view's ground, [x, y, z] in continent feet, or null.
  showCursor(hit) {
    this.el.cursor.textContent = hit ? `tile ${Math.floor(hit[0] / TILE_FT)}, ${Math.floor(hit[2] / TILE_FT)} · ${Math.round(hit[1])} ft` : "";
  }

  // The detail step's brush settings, from its panel. Falloff is set as a share of the brush.
  applyDetailBrush() {
    const { detailRadius, detailRadiusValue, detailFalloff, detailFalloffValue, detailStrength, detailStrengthValue, detailErosion, detailTalus } = this.el;
    const radius = Number(detailRadius.value);
    const falloff = Math.max(CELL_FT, (radius * Number(detailFalloff.value)) / 100);
    detailRadiusValue.textContent = `${radius} ft`;
    detailFalloffValue.textContent = `${Math.round(falloff)} ft`;
    detailStrengthValue.textContent = `${detailStrength.value} ft/s`;
    if (this.step !== "detail") return;
    this.detail?.setBrush({
      tool: this.toolName,
      radius,
      falloff,
      strength: Number(detailStrength.value),
      erosion: detailErosion.value,
      talus: Math.max(5, Math.min(85, Number(detailTalus.value) || 35)),
    });
  }

  // Writes tiles changed in the detail step back into the world, and marks them edited by hand.
  saveDetail(keys) {
    for (const key of keys) {
      const tile = this.detail.view.decoded.get(key);
      const [tx, tz] = tile.coords;
      const gz = gzipSync(encodeTile(tile));
      this.world.files.set(tilePath(this.continent, tx, tz), gz);
      this.thumbnails.redraw(tx, tz, gz);
      this.details.drop(tx, tz);
    }
    this.setEdited(keys, true);
    this.renderPanel();
  }

  // Detail step hotkeys: digits pick a tool, [ and ] size the brush, and - and = its strength.
  // Returns whether the key was one of them.
  detailKey(e) {
    const { detailRadius, detailStrength } = this.el;
    const step = (input, by, least) => {
      input.value = Math.max(Number(input.min), Math.min(Number(input.max), Math.round(Math.max(least, Number(input.value)) * by)));
      this.applyDetailBrush();
    };
    if (/^[1-9]$/.test(e.key) && DETAIL_TOOLS[Number(e.key) - 1]) this.setTool(DETAIL_TOOLS[Number(e.key) - 1]);
    else if (e.key === "[") step(detailRadius, 1 / 1.25, 0);
    else if (e.key === "]") step(detailRadius, 1.25, 8);
    else if (e.key === "-") step(detailStrength, 1 / 1.25, 0);
    else if (e.key === "=") step(detailStrength, 1.25, 4);
    else return false;
    return true;
  }

  // The heights step: the land grid in 3d, to sculpt.
  async showSculpt() {
    // Made once, though it's asked for again while the module loads.
    this.sculptLoading ??= import("./sculptView.js").then(({ SculptView }) => {
      this.sculpt = new SculptView(this.el.sculpt, {
        onStroke: () => this.landChanged(),
        onPointer: (hit) => this.showCursor(hit),
      });
      this.applyBrush();
    });
    await this.sculptLoading;
    if (this.step !== "heights") return;
    this.sculpt.setLayers({ heat: this.option("heat"), contours: this.option("contours"), grid: this.option("grid") });
    const [x, z] = [this.map.view.x * TILE_FT, this.map.view.z * TILE_FT];
    this.sculpt.show(this.land, [x, z]);
  }

  // The sculpting settings from the heights step's panel.
  applyBrush() {
    const { brushSize, brushSizeValue, brushStrength, brushStrengthValue, setHeight, terraceStep, stampShape, stampBlend, stampHeight, erosionKind, talus } = this.el;
    brushSizeValue.textContent = `${brushSize.value} ft`;
    brushStrengthValue.textContent = `${brushStrength.value} ft/s`;
    this.sculpt?.setBrush({
      tool: this.toolName,
      radius: Number(brushSize.value),
      strength: Number(brushStrength.value),
      target: Number(setHeight.value) || 0,
      terrace: Math.max(1, Number(terraceStep.value) || 50),
      shape: stampShape.value,
      blend: stampBlend.value,
      height: Number(stampHeight.value) || 0,
      erosion: erosionKind.value,
      talus: Math.max(5, Math.min(85, Number(talus.value) || 35)),
    });
  }

  // Heights step hotkeys: digits pick a tool, [ and ] size the brush, - and = its strength, and
  // escape drops a ramp half laid. Returns whether the key was one of them.
  sculptKey(e) {
    const { brushSize, brushStrength } = this.el;
    const step = (input, by) => {
      input.value = Math.max(Number(input.min), Math.min(Number(input.max), Math.round(Number(input.value) * by)));
      this.applyBrush();
    };
    if (/^[0-9]$/.test(e.key) && SCULPT_TOOLS[(Number(e.key) + 9) % 10]) this.setTool(SCULPT_TOOLS[(Number(e.key) + 9) % 10]);
    else if (e.key === "[") step(brushSize, 1 / 1.25);
    else if (e.key === "]") step(brushSize, 1.25);
    else if (e.key === "-") step(brushStrength, 1 / 1.25);
    else if (e.key === "=") step(brushStrength, 1.25);
    else if (e.key === "Escape") this.sculpt?.cancel();
    else return false;
    return true;
  }

  // The feature kinds the current step edits.
  get kinds() {
    return STEPS[this.step].kinds;
  }

  // A checkbox in the current step's section, by its data-option name.
  option(name) {
    return Boolean(this.el.steps.find((s) => s.dataset.step === this.step)?.querySelector(`[data-option=${name}]`)?.checked);
  }

  // Which of the sketch's features the map shows: the step's own, and the water on the water and
  // features steps, or on the biomes step when asked.
  markKinds() {
    return { kinds: this.kinds, water: this.step === "water" || this.step === "civilization" || (this.step === "biomes" && this.option("rivers")) };
  }

  // --- the heights and biomes maps ---

  // The map drawn under the current step's marks: "heights", "biomes", "relief" (bare shaded
  // ground), or null.
  previewKind() {
    if (this.step === "civilization") return this.option("heightmap") ? "heights" : null;
    if (this.step === "zones") return this.option("heightmap") ? "heights" : "relief";
    return ["heights", "biomes"].includes(STEPS[this.step].map) ? STEPS[this.step].map : null;
  }

  viewChanged() {
    this.renderScale();
    if (!this.previewKind()) return;
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.updatePreview(), PREVIEW_DELAY_MS);
  }

  // Asks for a fresh heights or biomes map of what's in sight, from the zones as they are now,
  // mid-drag included.
  updatePreview() {
    this.updateWater();
    this.updateRoads();
    const kind = this.previewKind();
    if (!kind) return;
    const [x0, z0, x1, z1] = this.map.bounds();
    const [mx, mz] = [(x1 - x0) * PREVIEW_MARGIN, (z1 - z0) * PREVIEW_MARGIN];
    const bounds = [x0 - mx, z0 - mz, x1 + mx, z1 + mz].map((v) => v * TILE_FT);
    const { width, height } = this.map.canvas;
    if (!width || !height) return; // hidden, while walking
    const side = Math.round((Math.max(width, height) * (1 + 2 * PREVIEW_MARGIN)) / PREVIEW_PX);
    this.previews.request(this.continentState(), this.continent, { biomes: kind === "biomes", plain: kind === "relief", bounds, side });
  }

  showPreview(grid) {
    if (!grid) {
      this.preview = null;
    } else {
      const canvas = document.createElement("canvas");
      [canvas.width, canvas.height] = [grid.nx, grid.nz];
      canvas.getContext("2d").putImageData(new ImageData(grid.rgba, grid.nx, grid.nz), 0, 0);
      this.preview = { step: grid.biomes ? "biomes" : grid.plain ? "relief" : "heights", canvas, grid };
    }
    this.map.render();
  }

  // --- panel ---

  bindPanel() {
    const { continent, newZone, zoneName, drawRegion, deleteZone, generate, regenerateAll } = this.el;
    // Tiles edited by hand are only overwritten when the author says so.
    const overwrite = (held) => held.length > 0 && window.confirm(`${held.length} of these tile${held.length === 1 ? " was" : "s were"} edited by hand. Overwrite ${held.length === 1 ? "it" : "them"} too? Cancel generates the rest and leaves ${held.length === 1 ? "it" : "them"} as ${held.length === 1 ? "it is" : "they are"}.`);
    const keys = (list) => list.map((k) => k.split(",").map(Number));
    generate.addEventListener("click", () => {
      const { stale, missing, held } = this.outOfDate();
      this.generate(generate, keys([...stale, ...missing, ...(overwrite(held) ? held : [])]));
    });
    regenerateAll.addEventListener("click", () => {
      const edited = this.editedTiles();
      const all = [...this.landTiles()];
      if (!window.confirm(`Regenerate all ${all.length} tiles? It replaces every generated tile.`)) return;
      const held = all.filter((k) => edited.has(k) && this.world.files.has(tilePath(this.continent, ...k.split(",").map(Number))));
      const skip = overwrite(held) ? new Set() : new Set(held);
      this.generate(regenerateAll, keys(all.filter((k) => !skip.has(k))));
    });
    for (const tab of this.el.stepTabs) tab.addEventListener("click", () => this.setStep(tab.dataset.step));
    for (const section of this.el.steps) {
      for (const input of section.querySelectorAll("[data-option]")) {
        input.addEventListener("change", () => {
          this.map.render();
          this.updatePreview();
          if (this.step === "heights") this.showSculpt();
        });
      }
    }
    for (const tools of this.el.tools) {
      for (const name of STEPS[tools.dataset.tools].tools) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.tool = name;
        b.textContent = PINS[name]?.tool ?? PINS[name]?.label ?? name;
        b.addEventListener("click", () => this.setTool(name));
        tools.append(b);
      }
    }
    this.el.zoomIn.addEventListener("click", () => this.map.zoom(1));
    this.el.zoomOut.addEventListener("click", () => this.map.zoom(-1));
    // Walk asks where to start; the next click on the map starts there.
    for (const input of [this.el.brushSize, this.el.brushStrength, this.el.setHeight, this.el.terraceStep, this.el.stampShape, this.el.stampBlend, this.el.stampHeight, this.el.erosionKind, this.el.talus]) {
      input.addEventListener("input", () => this.applyBrush());
    }
    for (const shape of Object.keys(SHAPES)) this.el.stampShape.add(new Option(shape, shape));
    for (const blend of BLENDS) this.el.stampBlend.add(new Option({ add: "add to the ground", max: "raise to the shape", min: "cut to the shape" }[blend], blend));
    for (const kind of EROSIONS) {
      const name = { water: "running water", slump: "slumping" }[kind];
      this.el.erosionKind.add(new Option(name, kind));
      this.el.detailErosion.add(new Option(name, kind));
    }
    for (const input of [this.el.detailRadius, this.el.detailFalloff, this.el.detailStrength, this.el.detailErosion, this.el.detailTalus]) {
      input.addEventListener("input", () => this.applyDetailBrush());
    }
    this.applyDetailBrush();
    this.el.commitLand.addEventListener("click", () => this.commitLand());
    this.el.discardLand.addEventListener("click", () => {
      if (window.confirm("Discard the sculpting since the last commit?")) this.discardLand();
    });
    // Shift and ctrl change what a sculpting tool does while they're held.
    for (const type of ["keydown", "keyup"]) window.addEventListener(type, (e) => this.sculpt?.setKeys({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }));
    this.el.exaggeration.addEventListener("input", () => {
      this.el.exaggerationValue.textContent = this.el.exaggeration.value;
      this.overview?.setExaggeration(Number(this.el.exaggeration.value));
    });
    this.el.walk.addEventListener("click", (e) => {
      e.currentTarget.blur(); // so space jumps instead of pressing the button again
      if (this.walking) this.view3d.stopWalk();
      else this.walkPicking = !this.walkPicking;
      this.renderPanel();
    });

    continent.addEventListener("change", () => {
      this.continent = continent.value;
      this.active = null;
      this.drawing = null;
      this.showContinent();
    });

    newZone.addEventListener("click", () => {
      const name = window.prompt("Zone name")?.trim();
      if (!name) return;
      const zone = createZone(this.world, this.continent, name);
      this.dirty = true;
      this.active = zone.key;
      this.setStep("zones");
      this.drawing = [];
      this.reload();
    });

    zoneName.addEventListener("input", () => {
      const zone = this.activeZone;
      if (!zone) return;
      zone.name = zoneName.value;
      this.save(zone);
    });

    deleteZone.addEventListener("click", () => {
      const zone = this.activeZone;
      if (!zone || !window.confirm(`Delete ${zone.name || zone.key}? Its generated tiles stay.`)) return;
      removeZone(this.world, this.continent, zone.key);
      this.dirty = true;
      this.active = null;
      this.drawing = null;
      this.say();
      this.reload();
    });

    drawRegion.addEventListener("click", () => {
      const zone = this.activeZone;
      if (!zone) return;
      if (zone.region.length && !window.confirm("Replace this zone's region?")) return;
      this.drawing = [];
      this.renderPanel();
      this.map.render();
    });
  }

  // Picks a zone on the zones step, or drops the pick for null.
  pickZone(key) {
    this.active = key;
    this.drawing = null;
    this.say();
    this.renderPanel();
    this.map.render();
  }

  renderPanel() {
    const { zoneList, zoneName, regionInfo, drawRegion, hint } = this.el;
    zoneList.innerHTML = "";
    for (const zone of this.zones) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = zone.name || zone.key;
      button.classList.toggle("active", zone.key === this.active);
      button.addEventListener("click", () => this.pickZone(zone.key === this.active ? null : zone.key));
      item.append(button);
      zoneList.append(item);
    }
    if (!this.zones.length) zoneList.innerHTML = '<li class="editor-empty">no zones yet</li>';

    for (const el of [...this.el.steps, ...this.el.stepTabs]) el.classList.toggle("open", el.dataset.step === this.step);
    const zone = this.activeZone;
    this.el.zoneEdit.hidden = !zone;
    if (zone) {
      if (document.activeElement !== zoneName) zoneName.value = zone.name;
      regionInfo.textContent = zone.region.length ? `${cornerCount(zone.region)} corners · ${tilesTouched(zone.region).length} tiles` : "no region yet";
      drawRegion.textContent = zone.region.length ? "redraw region" : "draw region";
    }

    const { stale, missing, held } = this.outOfDate();
    const todo = stale.length + missing.length + held.length;
    const edited = this.editedTiles().size;
    this.el.tilesInfo.textContent = `${this.landTiles().size} tiles with land · ${stale.length + held.length} out of date · ${missing.length} not generated${edited ? ` · ${edited} edited by hand${held.length ? `, ${held.length} of them out of date` : ""}` : ""}${this.landDirty ? " · land not committed yet" : ""}`;
    this.el.landStatus.textContent = this.landDirty ? "Sculpted since the last commit. Tiles are made from committed land only." : "Everything's committed.";
    this.el.commitLand.disabled = !this.landDirty;
    this.el.discardLand.disabled = !this.landDirty;
    for (const el of this.el.steps.find((s) => s.dataset.step === this.step)?.querySelectorAll("[data-for]") ?? []) el.hidden = !el.dataset.for.split(" ").includes(this.toolName);
    this.el.generate.disabled = !todo || this.generating;
    this.el.regenerateAll.disabled = !this.landTiles().size || this.generating;
    if (!this.generating) {
      this.el.generate.textContent = todo ? `generate ${todo} tile${todo === 1 ? "" : "s"}` : "all tiles up to date";
      this.el.regenerateAll.textContent = "regenerate every tile";
    }
    for (const b of this.el.tools.flatMap((t) => [...t.children])) {
      b.classList.toggle("active", b.dataset.tool === this.toolName);
      b.disabled = b.parentElement.dataset.tools !== "heights" && !this.hasLand();
    }
    hint.textContent = this.walking ? HINT_WALK : this.walkPicking ? HINT_PICK_WALK : HINTS[this.mode()];
    this.el.graphicsButton.hidden = !this.walking;
    this.el.timeButton.hidden = !this.walking;
    this.el.scaleBar.hidden = this.walking || IN_3D.has(this.step);
    this.el.walk.hidden = IN_3D.has(this.step);
    this.el.walk.textContent = this.walking ? "stop walking" : this.walkPicking ? "cancel walk" : "walk";
    this.el.walk.classList.toggle("active", Boolean(this.walking || this.walkPicking));
    this.renderScale();
  }

  renderScale() {
    const across = this.map.tilesAcross;
    this.el.scale.textContent = `${across < 10 ? across.toFixed(1) : Math.round(across)} tiles across`;
  }

  // Generates the given tiles from every zone on the continent, counting progress on `button`.
  async generate(button, tiles) {
    if (this.generating || !tiles.length) return;
    const started = performance.now();
    let done = 0;
    let frame = null;
    this.generating = true;
    this.renderPanel();
    this.say();
    try {
      const overwritten = tiles.map(([tx, tz]) => `${tx},${tz}`).filter((k) => this.editedTiles().has(k));
      if (overwritten.length) this.setEdited(overwritten, false);
      await this.generator.run(this.storedState(), this.continent, tiles, ({ tx, tz, gz, rgba, cells, falls }) => {
        this.world.files.set(tilePath(this.continent, tx, tz), gz);
        this.pending.delete(`${tx},${tz}`);
        this.thumbnails.set(tx, tz, { rgba, cells, gz, falls });
        this.details.drop(tx, tz);
        button.textContent = `generating ${++done}/${tiles.length}`;
        frame ??= requestAnimationFrame(() => {
          frame = null;
          this.map.render();
        });
      });
      this.dirty = true;
      this.say(`Generated ${tiles.length} tiles in ${((performance.now() - started) / 1000).toFixed(1)}s.`, { info: true });
    } catch (err) {
      this.say(`Generation failed: ${err.message}`);
    } finally {
      this.generating = false;
      this.renderPanel();
      this.map.render();
    }
  }

  renderProps() {
    this.features.renderProps(this.el.props, this.sketch);
    this.palette.render();
  }

  mode() {
    if (this.step === "zones") {
      const zone = this.activeZone;
      if (!zone) return "none";
      if (this.drawing) return "draw";
      return zone.region.length ? "region" : "empty";
    }
    if (this.step === "tiles" || IN_3D.has(this.step)) return this.step === "heights" ? this.toolName : this.step;
    if (!this.hasLand()) return "noLand";
    if (ROADS[this.toolName]) return "road";
    if (PINS[this.toolName]) return "pin";
    return this.toolName;
  }

  setTool(name) {
    this.toolName = name;
    this.applyBrush();
    this.applyDetailBrush();
    this.palette.render();
    this.say();
    this.renderPanel();
    this.map.render();
  }

  markSaved() {
    this.dirty = false;
  }

  // Shows a message under the panel: a problem by default, or { info: true } for news.
  say(text, { info = false } = {}) {
    this.el.message.textContent = text ?? "";
    this.el.message.classList.toggle("info", info);
  }

  otherZones(zone) {
    return this.zones.filter((z) => z.key !== zone.key && z.region.length);
  }

  // Where a corner lands: on another zone's corner or edge when it's near one, so neighbours
  // share boundaries exactly, and otherwise on the nearest cell corner.
  snap(tile, zone) {
    const others = this.otherZones(zone);
    for (const other of others) {
      for (const { points } of rings(other.region)) {
        const corner = points.find((p) => this.nearScreen(p, tile));
        if (corner) return [...corner];
      }
    }
    for (const other of others) {
      const edge = nearestEdge(other.region, tile);
      if (edge.dist * this.map.view.scale < HIT_PX * this.map.dpr) return edge.point;
    }
    return snapToCell(tile);
  }

  // On the region or its edge.
  inRegion(point, zone) {
    return pointInRegion(point, zone.region) || nearestEdge(zone.region, point).dist < 1e-9;
  }

  // The zone's region with every other zone cut out of it, or null (with a message) when nothing
  // would be left or it would come apart. Zones must be contiguous.
  clip(region, zone) {
    const others = this.otherZones(zone).map((z) => z.region);
    return this.checkContiguous(resubtract(region, others));
  }

  checkContiguous(region) {
    if (region.length === 1) return region;
    this.say(
      region.length
        ? `Other zones would split this region into ${region.length} pieces; a zone must be one piece.`
        : "Other zones cover all of that region; nothing would be left.",
    );
    return null;
  }

  // --- tools ---

  tool() {
    if (this.walkPicking) return { down: (tile) => (this.walkAt(tile), true) };
    if (this.step === "zones") {
      const zone = this.activeZone;
      if (zone && this.drawing) return this.drawTool(zone);
      return this.zoneTool(zone);
    }
    if (!this.kinds.length || !this.hasLand()) return null;
    const inner = this.features.tool(this.sketch, this.toolName, this.kinds);
    return {
      ...inner,
      move: (tile, e) => {
        inner.move?.(tile, e);
        if (this.features.dragging) this.updatePreview();
      },
      // Routes kept mid-drag may cross others.
      up: (tile, e) => {
        inner.up?.(tile, e);
        if (this.joinCrossings()) this.saveSketch();
      },
    };
  }

  drawTool(zone) {
    return {
      down: (tile) => {
        const pts = this.drawing;
        if (pts.length >= 3 && this.nearScreen(pts[0], tile)) {
          this.finishDrawing(zone);
        } else {
          pts.push(this.snap(tile, zone));
          this.say();
        }
        return true;
      },
    };
  }

  // The zones step: drag the picked zone's corners, or click a zone to pick it. Corners are
  // addressed as { poly, ring, index } within the region. Every change re-cuts the other zones out
  // of the region when the drag ends.
  zoneTool(zone) {
    const cornerAt = (tile) => {
      for (const { poly, ring, points } of rings(zone?.region ?? [])) {
        const index = points.findIndex((p) => this.nearScreen(p, tile));
        if (index >= 0) return { poly, ring, index };
      }
      return null;
    };
    const ringOf = ({ poly, ring }) => zone.region[poly][ring];

    return {
      down: (tile, e) => {
        let corner = zone && cornerAt(tile);
        if (corner && e.altKey) {
          if (ringOf(corner).length <= 3) return true;
          const edited = structuredClone(zone.region);
          edited[corner.poly][corner.ring].splice(corner.index, 1);
          const clipped = this.clip(edited, zone);
          if (clipped) {
            zone.region = clipped;
            this.save(zone);
          }
          return true;
        }
        if (zone?.region.length && !corner && e.shiftKey) {
          const edge = nearestEdge(zone.region, tile);
          if (edge.dist * this.map.view.scale <= HIT_PX * this.map.dpr) {
            corner = { poly: edge.poly, ring: edge.ring, index: edge.index + 1 };
            ringOf(corner).splice(corner.index, 0, edge.point);
          }
        }
        if (!corner) {
          // A click on another zone picks it; the press still pans.
          const other = this.zoneAt(tile);
          if (other && other.key !== this.active) this.pickZone(other.key);
          return false;
        }
        this.dragging = { corner, before: structuredClone(zone.region) };
        return true;
      },
      move: (tile) => {
        const { corner } = this.dragging;
        ringOf(corner)[corner.index] = this.snap(tile, zone);
      },
      up: () => {
        const clipped = this.clip(zone.region, zone);
        zone.region = clipped ?? this.dragging.before;
        if (clipped) this.say();
        this.dragging = null;
        this.save(zone);
      },
    };
  }

  finishDrawing(zone) {
    if (this.drawing.length < 3) return;
    const others = this.otherZones(zone).map((z) => z.region);
    const region = this.checkContiguous(subtractZones(this.drawing, others));
    if (!region) return;
    this.say();
    zone.region = region;
    this.drawing = null;
    this.save(zone);
  }

  onKey(e) {
    if (this.walkPicking && e.key === "Escape") {
      this.walkPicking = false;
      this.renderPanel();
      return;
    }
    if (e.target.matches("input, textarea, select")) return;
    // G does what the walk button does: pick a spot to walk from, cancel that, or stop walking.
    if ((this.step === "heights" || this.step === "detail") && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      const target = this.step === "heights" ? this.sculpt : this.detail;
      if (e.shiftKey) target?.redo();
      else target?.undo();
      return;
    }
    if (this.step === "detail" && !e.ctrlKey && !e.metaKey && !e.altKey && this.detailKey(e)) {
      e.preventDefault();
      return;
    }
    if (this.step === "heights" && !e.ctrlKey && !e.metaKey && !e.altKey && this.sculptKey(e)) {
      e.preventDefault();
      return;
    }
    if (e.key.toLowerCase() === "g" && this.step !== "3d" && this.step !== "heights" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.el.walk.click();
      return;
    }
    if (this.walking) return;
    if (this.drawing && this.editZone) {
      if (e.key === "Enter") this.finishDrawing(this.editZone);
      if (e.key === "Escape") this.drawing = null;
      if (e.key === "Backspace") this.drawing.pop();
    } else if (this.step === "zones" || !this.features.onKey(e, this.sketch)) {
      return;
    }
    e.preventDefault();
    this.renderPanel();
    this.map.render();
  }

  nearScreen(point, tile) {
    const [ax, ay] = this.map.toScreen(point);
    const [bx, by] = this.map.toScreen(tile);
    return Math.hypot(ax - bx, ay - by) < HIT_PX * this.map.dpr;
  }

  // --- drawing ---

  // Under the grid: the generated tiles, when the step shows them, and the heights or biomes map.
  drawBase(ctx, map) {
    const tiles = this.step === "tiles" || this.option("tiles");
    if (tiles) this.drawTiles(ctx, map);
    const preview = this.preview;
    if (!preview || preview.step !== this.previewKind()) return;
    const { grid, canvas } = preview;
    const half = grid.stepFt / 2;
    const [sx, sy] = map.toScreen([(grid.x0 - half) / TILE_FT, (grid.z0 - half) / TILE_FT]);
    const size = (map.view.scale * grid.stepFt) / TILE_FT;
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = tiles ? 0.7 : 1;
    ctx.drawImage(canvas, sx, sy, grid.nx * size, grid.nz * size);
    ctx.globalAlpha = 1;
  }

  // The generated tiles in sight: the small thumbnails a chunk at a time, then, zoomed in past
  // them, each tile's full thumbnail, or close up when few enough are in sight. A tile still being
  // drawn shows the next smaller picture meanwhile.
  drawTiles(ctx, map) {
    const [x0, z0, x1, z1] = map.bounds();
    const [tx0, tz0, tx1, tz1] = [Math.floor(x0), Math.floor(z0), Math.floor(x1), Math.floor(z1)];
    const close = (tx1 - tx0 + 1) * (tz1 - tz0 + 1) < DETAIL_MAX_TILES;
    const full = close || map.view.scale > THUMB_PX * FULL_THUMB_ZOOM;
    this.details.forgetQueued();
    this.thumbnails.forgetQueued();
    ctx.imageSmoothingEnabled = !close && map.view.scale < 64;
    // A hair of overlap hides seams between neighbours.
    const chunkSize = CHUNK * map.view.scale + 0.5;
    for (let cx = Math.floor(tx0 / CHUNK); cx <= Math.floor(tx1 / CHUNK); cx++) {
      for (let cz = Math.floor(tz0 / CHUNK); cz <= Math.floor(tz1 / CHUNK); cz++) {
        const chunk = this.thumbnails.chunk(cx, cz, false);
        if (!chunk) continue;
        const [sx, sy] = map.toScreen([cx * CHUNK, cz * CHUNK]);
        ctx.drawImage(chunk, sx, sy, chunkSize, chunkSize);
      }
    }
    if (!full) return;
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let tz = tz0; tz <= tz1; tz++) {
        if (!this.thumbnails.has(tx, tz)) continue;
        const image = (close && this.details.get(tx, tz)) || this.thumbnails.get(tx, tz);
        if (!image) continue;
        const [sx, sy] = map.toScreen([tx, tz]);
        ctx.drawImage(image, sx, sy, map.view.scale + 0.5, map.view.scale + 0.5);
      }
    }
  }

  draw(ctx, map) {
    if (this.step === "tiles" && this.option("stale")) this.drawOutOfDate(ctx, map);
    this.drawEdited(ctx, map);
    const zonesStep = this.step === "zones";
    const editing = this.editZone;
    if (zonesStep || this.option("boundaries")) {
      for (const zone of this.zones) if (zone !== editing) this.drawRegion(ctx, map, zone, false);
    }
    this.features.draw(ctx, this.sketch, this.markKinds());
    if (this.step === "water") this.drawFalls(ctx, map);
    if (!editing) return;
    if (!this.drawing) {
      this.drawRegion(ctx, map, editing, true);
      return;
    }
    const pts = this.drawing.map((p) => map.toScreen(p));
    const snapped = map.pointer && this.snap(map.pointer, editing);
    if (snapped) pts.push(map.toScreen(snapped));
    for (const [color, width] of [[COLORS.casing, 5], [COLORS.active, 2.5]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * map.dpr;
      polyline(ctx, pts, false);
    }
    this.drawing.forEach((p, i) => handle(ctx, map.toScreen(p), (i === 0 ? 6 : 4) * map.dpr, COLORS.active));
    // A ring where the next corner lands on a neighbour's corner or edge.
    const free = map.pointer && snapToCell(map.pointer);
    if (snapped && (snapped[0] !== free[0] || snapped[1] !== free[1])) {
      const [x, y] = map.toScreen(snapped);
      ctx.strokeStyle = COLORS.active;
      ctx.lineWidth = 2 * map.dpr;
      ctx.beginPath();
      ctx.arc(x, y, 10 * map.dpr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // The waterfalls in the generated tiles: a white line down each, from a ring at its lip.
  drawFalls(ctx, map) {
    const dpr = map.dpr;
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    for (const falls of this.thumbnails.falls.values()) {
      for (const { top, bottom } of falls) {
        const [ax, ay] = map.toScreen([top[0] / TILE_FT, top[2] / TILE_FT]);
        const [bx, by] = map.toScreen([bottom[0] / TILE_FT, bottom[2] / TILE_FT]);
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(ax, ay, 5 * dpr, 0, Math.PI * 2);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }
  }

  // Hand-edited tiles, outlined, and filled red where something upstream changed under them.
  drawEdited(ctx, map) {
    const edited = this.editedTiles();
    if (!edited.size) return;
    const s = map.view.scale;
    ctx.fillStyle = COLORS.held;
    for (const key of this.outOfDate().held) {
      const [sx, sy] = map.toScreen(key.split(",").map(Number));
      ctx.fillRect(sx, sy, s, s);
    }
    ctx.strokeStyle = COLORS.edited;
    ctx.lineWidth = Math.max(1, Math.min(3, s / 16)) * map.dpr;
    for (const key of edited) {
      const [sx, sy] = map.toScreen(key.split(",").map(Number));
      ctx.strokeRect(sx + 1, sy + 1, s - 2, s - 2);
    }
  }

  drawOutOfDate(ctx, map) {
    const { stale, missing } = this.outOfDate();
    for (const [keys, color] of [[stale, COLORS.stale], [missing, COLORS.missing]]) {
      ctx.fillStyle = color;
      for (const key of keys) {
        const [sx, sy] = map.toScreen(key.split(",").map(Number));
        ctx.fillRect(sx, sy, map.view.scale, map.view.scale);
      }
    }
  }

  drawRegion(ctx, map, zone, active) {
    if (!zone.region.length) return;
    const dpr = map.dpr;
    const all = rings(zone.region).map((r) => r.points.map((p) => map.toScreen(p)));
    ctx.beginPath();
    for (const pts of all) {
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    }
    ctx.fillStyle = active ? COLORS.activeFill : COLORS.lockedFill;
    if (this.step === "zones") ctx.fill("evenodd");
    // A dark casing under each line, so it shows over any map.
    ctx.strokeStyle = COLORS.casing;
    ctx.lineWidth = 5 * dpr;
    ctx.stroke();
    ctx.strokeStyle = active ? COLORS.active : COLORS.locked;
    ctx.lineWidth = 2.5 * dpr;
    ctx.stroke();
    // On the zones step every corner shows, so neighbours can be drawn to meet them.
    if (active || this.step === "zones") all.flat().forEach((p) => handle(ctx, p, (active ? 4.5 : 3.5) * dpr, active ? COLORS.active : COLORS.locked));

    const [cx, cy] = map.toScreen(labelPoint(zone.region));
    ctx.fillStyle = active ? COLORS.active : COLORS.locked;
    ctx.font = `${13 * dpr}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.fillText(zone.name || zone.key, cx, cy);
    ctx.textAlign = "start";
  }
}

function polyline(ctx, pts, closed) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (closed) ctx.closePath();
  ctx.stroke();
}

function handle(ctx, [x, y], r, color) {
  ctx.fillStyle = COLORS.casing;
  ctx.fillRect(x - r - 1.5, y - r - 1.5, 2 * r + 3, 2 * r + 3);
  ctx.fillStyle = color;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
}

// Keeps a popover under its button, lined up with its left edge.
function placeUnder(popover, button) {
  popover.addEventListener("toggle", (e) => {
    if (e.newState !== "open") return;
    const at = button.getBoundingClientRect();
    Object.assign(popover.style, { top: `${at.bottom + 4}px`, left: `${at.left}px` });
  });
}

// How fast time can pass while walking, as multiples of the shared clock.
const TIME_SPEEDS = [0, 1, 3, CYCLE_MS / (20 * 60 * 1000), 30, 100, 400];

function nearestSpeed(speed) {
  let best = 0;
  TIME_SPEEDS.forEach((s, i) => (Math.abs(s - speed) < Math.abs(TIME_SPEEDS[best] - speed) ? (best = i) : null));
  return best;
}

// Like "stopped", "real time" or "a day in 20m".
function speedLabel(speed) {
  if (!speed) return "stopped";
  if (speed === 1) return "real time";
  const minutes = CYCLE_MS / speed / 60000;
  if (minutes < 1) return `a day in ${Math.round(minutes * 60)}s`;
  return minutes >= 60 ? `a day in ${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m` : `a day in ${Math.round(minutes)}m`;
}

const MOON_NAMES = ["new moon", "waxing crescent", "first quarter", "waxing gibbous", "full moon", "waning gibbous", "last quarter", "waning crescent"];

// The part of the day at `cycles`, and how long it has left, like "12m" or "1h 5m".
function timeLabel(cycles) {
  const { name, through } = phaseAt(cycles);
  const minutes = Math.ceil(PHASES.find(([phase]) => phase === name)[1] * (1 - through));
  return { phase: name, left: minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m` };
}

// Right-drags pan the map and turn the walker, so the browser's menu never opens over the view,
// nor where a right-drag that started there ends.
function noContextMenu(stage) {
  let dragged = false;
  stage.addEventListener("pointerdown", (e) => (dragged ||= e.button === 2), { capture: true });
  window.addEventListener("contextmenu", (e) => {
    if (dragged || stage.contains(e.target)) e.preventDefault();
    dragged = false;
  });
  window.addEventListener("pointerup", (e) => {
    if (e.button === 2) setTimeout(() => (dragged = false), 300);
  });
}
