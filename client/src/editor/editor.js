import { changedTiles } from "./changes.js";
import { DEFAULT_SOURCE_WIDTH_FT, FEATURE_HINTS, Features, PINS, ROADS, nextId, nextWaterId } from "./features.js";
import { MapView } from "./mapView.js";
import { keyNav } from "./keyNav.js";
import { TileGenerator } from "./generation.js";
import { CHUNK, THUMB_PX } from "./thumbPixels.js";
import { Thumbnails, TileDetails, surfaceTiles, surfacePath } from "./thumbnails.js";
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
import { WaterSimulator, pourOver } from "./waterflow.js";
import { ROUTE_VERSION, RoadRouter, findCrossing, gradeCap } from "./roads.js";
import { hashString } from "../world/noise.js";
import { LAKE_STEP_FT, fillLake, inRegion } from "../world/lakes.js";
import { makePolyline, nearBounds, nearest } from "../world/polyline.js";
import { waterGround } from "../world/waterGround.js";
import { LandGrid, landBounds, loadLand, saveLand } from "../world/landGrid.js";
import { BLENDS, EROSIONS, SHAPES, TOOLS as SCULPT_TOOLS } from "./sculptTools.js";
import { DETAIL_TOOLS } from "./detailTools.js";
import { TRAIL_KINDS, TRAIL_STATES } from "./detailTrails.js";
import { BUILT_PREFIX, builtOf, makeObject, setBuiltObjects, specOf, tiledImages } from "../world/objects.js";
import { SLAB_PATTERNS, SLAB_PRESETS } from "../world/slabs.js";
import { presetPixels } from "./slabTextures.js";
import { paletteColors, textsOf } from "../world/builtObjects.js";
import { MAX_TEXT, signText } from "../world/pixelFont.js";
import { adoptStrays, allCollections, builtObjects, builtStructures, images } from "../objects/collections.js";
import { placedCount } from "../objects/placed.js";
import { decodeTile, encodeTile } from "../world/tileCodec.js";
import { gunzipSync, gzipSync } from "fflate";
import { CELL_FT, TILE_FT } from "../world/constants.js";
import { TREE_KINDS, TREE_SIZES, treeTerrain } from "../world/trees.js";
import { STRUCTURE_PREFIX } from "../world/structures.js";
import { PlacePicker } from "./placePicker.js";
import { TERRAIN, prepareShape, prepareWorld } from "../world/generator.js";
import { CYCLE_MS, LUNAR_DAYS, PHASES, cyclesAt, moonAge, phaseAt } from "../world/dayNight.js";

const HIT_PX = 8;
const COLORS = {
  active: "#f0c850",
  activeFill: "rgba(240, 200, 80, 0.06)",
  stale: "rgba(255, 130, 40, 0.45)",
  missing: "rgba(255, 255, 255, 0.16)",
  edited: "rgba(200, 120, 255, 0.9)",
  held: "rgba(220, 20, 40, 0.85)",
  locked: "rgba(255, 255, 255, 0.95)",
  casing: "rgba(0, 0, 0, 0.75)",
  lockedFill: "rgba(255, 255, 255, 0.07)",
};
const NAV = "drag or W A S D to pan · wheel or C/V to zoom";
// Steps drawn in 3d instead of on the map.
const IN_3D = new Set(["heights", "detail", "3d"]);
const HINTS = {
  detail: "left-drag to work the brush, or draw a trail or channel (esc drops it) · with water, click to pour from there, then keep or drop the rivers and lakes it would make · with objects or structures, click a thumbnail, then the ground to place it (esc lets it go); click one placed to pick it, drag to move it, Q E turn it, [ ] size it, delete removes it · with paint, drag to paint the ground or trees cell by cell (painting over a tree fells it there) · the arrows off the window's sides move the window a strip that way · W A S D pan · C V zoom · Q E turn the view (or the picked object) · 1-9 and 0 pick a tool · [ ] size · - = strength · right-drag turns · middle-drag pans · wheel zooms · ctrl-z undoes, ctrl-shift-z redoes",
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
  publish: `validate checks the saved world; a world that passes can be published as a version · ${NAV}`,
};
const HINT_WALK = "W/S run · A/D turn · Q/E strafe · space jumps · / walks · X sits · Z sprints · left-drag looks around · right-drag turns · wheel zooms · esc stops walking";
const HINT_PICK_WALK = "click where to start walking · esc cancels";
const HINT_PICK_DETAIL = "click the middle of where to edit in detail · F or the detail tab again keeps the last spot · esc cancels";

// The editor's steps, in the order you'd usually work, each with its own map and tools. Each step
// is a layer that depends only on the ones before it: the land's heights, then the water that
// runs over them, then the biomes that grow along it, then civilization on top, then the zones
// that divide it all up. The heights step sculpts the land grid in 3d (sculptView.js); the zones
// step edits one zone's region at a time; the rest edit the continent's sketch, the pins and paths
// drawn anywhere on its land. Publish checks the saved world and tags it as a version (main.js).
// `map` is what the step draws under its marks: a live preview worked
// out from the land (shapePreview.js), or the generated tiles.
const STEPS = {
  heights: { tools: SCULPT_TOOLS, kinds: [] },
  water: { tools: ["select", "source"], kinds: ["source", "river", "lake"], map: "heights" },
  biomes: { tools: ["select", "biome"], kinds: ["biome"], map: "biomes" },
  civilization: { tools: ["select", ...Object.keys(ROADS), "hub", "info", "spawn"], kinds: ["road", "hub", "info", "spawn"] },
  zones: { tools: [], kinds: [], map: "heights" },
  tiles: { tools: [], kinds: [], map: "tiles" },
  detail: { tools: [...DETAIL_TOOLS, "trails", "channel", "water", "objects", "structures", "paint", "slabs"], kinds: [] },
  "3d": { tools: [], kinds: [] },
  publish: { tools: [], kinds: [], map: "tiles" },
};
// With this many tiles in sight or more, tiles draw as their thumbnails instead of close up.
const DETAIL_MAX_TILES = 128;
// Past this many screen pixels per pixel of the small thumbnails, tiles draw their full ones.
const FULL_THUMB_ZOOM = 1.5;
// The swatch for a slab surface of your own: a color, with a pattern or a texture.
const CUSTOM = "custom";
const SWATCH_PX = 36;
// The detail step's pours stand in for a source pin with this id.
const DETAIL_POUR = "detail";
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
      (tx, tz) => this.world.files.get(surfacePath(this.continent, tx, tz)),
      () => this.map.render(),
    );
    this.generator = new TileGenerator();
    this.generating = false;
    this.pending = new Set(); // "x,z" keys of generated tiles whose sketch changed since
    this.previews = new ShapePreview((grid) => this.showPreview(grid));
    this.preview = null; // the latest heights or biomes picture: { step, canvas, grid }
    this.water = new WaterSimulator((key, result) => this.showWater(key, result));
    this.proposal = null; // { pin, key, result }: what pouring a source would add (pour)
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
      // Q and E turn a picked object instead (detailKey).
      else if (this.step === "detail") this.detail?.nudge(dt, this.detail.selected ? { ...move, turn: 0 } : move);
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
    this.loadBuiltObjects();
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
      if (!this.world.files.has(surfacePath(this.continent, tx, tz))) missing.push(key);
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
    const { pins, paths, water } = this.sketch;
    return { land: this.land.data, pins, paths, water, edited: this.editedHeights() };
  }

  // The continent as last stored, from the world's files.
  storedState() {
    const { pins, paths, water } = loadSketch(this.world, this.continent);
    return { land: loadLand(this.world.files, this.continent), pins, paths, water, edited: this.editedHeights() };
  }

  // The height layers of the tiles shaped by hand, by "tx,tz", which water runs over instead of the
  // land grid (world/waterGround.js). Each is read from its file once.
  editedHeights() {
    this.heightsOf ??= new WeakMap();
    const heights = new Map();
    for (const key of this.editedTiles()) {
      const bytes = this.world.files.get(surfacePath(this.continent, ...key.split(",").map(Number)));
      if (!bytes) continue;
      if (!this.heightsOf.has(bytes)) this.heightsOf.set(bytes, decodeTile(gunzipSync(bytes)).layers.height);
      heights.set(key, this.heightsOf.get(bytes));
    }
    return heights;
  }

  // A key for the ground water runs over: the land grid and the hand-shaped tiles, as they are.
  groundKey() {
    this.fileIds ??= new WeakMap();
    const id = (bytes) => {
      if (bytes && !this.fileIds.has(bytes)) this.fileIds.set(bytes, (this.nextFileId = (this.nextFileId ?? 0) + 1));
      return bytes ? this.fileIds.get(bytes) : 0;
    };
    const tiles = [...this.editedTiles()].sort().map((key) => `${key}:${id(this.world.files.get(surfacePath(this.continent, ...key.split(",").map(Number))))}`);
    return String(hashString(`${this.landHash()}|${tiles.join(";")}`));
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

  // Takes the spawn point off the other continents, for one placed on this one.
  dropSpawns() {
    for (const { key } of this.world.info.continents) {
      if (key === this.continent) continue;
      const sketch = loadSketch(this.world, key);
      if (!sketch.pins.some((p) => p.kind === "spawn")) continue;
      sketch.pins = sketch.pins.filter((p) => p.kind !== "spawn");
      saveSketch(this.world, key, sketch);
    }
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

  // Pours water from a source pin (waterflow.js), proposing the rivers and lakes it would make.
  // Water stops at the sea and at the sketch's water already there. The answer comes to showWater.
  pour(pin) {
    const sources = [{ id: pin.id, at: pin.at, width: pin.width }];
    const landKey = String(this.landHash());
    const water = this.waterShapes();
    const key = String(hashString(JSON.stringify([this.groundKey(), sources, water, this.continent])));
    this.proposal = { pin: pin.id, key, result: null };
    this.water.request({ key, landKey, continent: { land: this.land.data }, seedKey: this.continent, edited: this.editedHeights(), sources, water });
    this.renderProps();
    this.showPour();
  }

  showWater(key, result) {
    if (key !== this.proposal?.key) return;
    this.proposal.result = result;
    this.renderProps();
    this.showPour();
    this.map.render();
  }

  // Adds the proposal's rivers and lakes to the sketch.
  keepProposal() {
    const { rivers, pools } = this.proposal?.result ?? {};
    if (!rivers) return;
    const water = this.sketch.water;
    const before = JSON.stringify(water);
    for (const { points, width } of rivers) water.rivers.push({ id: nextWaterId(water, "w"), points, width });
    for (const { seed, level } of pools) water.lakes.push({ id: nextWaterId(water, "l"), seed, level });
    const inDetail = this.proposal.pin === DETAIL_POUR;
    this.proposal = null;
    this.saveSketch();
    this.renderProps();
    this.showPour();
    if (inDetail && this.detail) {
      // Hand-edited tiles in the window take the water now; the rest get it when tiles are generated.
      const edited = this.editedTiles();
      this.detail.reworkWater(this.detail.keys().filter((key) => edited.has(key)), before);
      this.say("Kept. Tiles you haven't edited by hand get the new water when tiles are generated again.");
    }
  }

  dropProposal() {
    this.proposal = null;
    this.renderProps();
    this.showPour();
    this.map.render();
  }

  // The generator's view of the continent as it is (generator.js prepareWorld), for the detail
  // step's water. Kept until the land or the sketch changes.
  bodies() {
    const key = hashString(JSON.stringify([this.groundKey(), this.sketch.pins, this.sketch.paths, this.sketch.water]));
    if (this.bodiesCache?.key !== key) this.bodiesCache = { key, ctx: prepareWorld(this.continentState(), this.continent) };
    return this.bodiesCache.ctx;
  }

  // The sketch's water as the water flow sees it, in ft: rivers' lines and half widths, and lakes'
  // outlines. Rivers and lakes in `leaving` are left out.
  waterShapes(leaving = new Set()) {
    const ft = (p) => p.map((v) => v * TILE_FT);
    const { rivers, lakes } = this.sketch.water;
    return {
      rivers: rivers.filter((r) => !leaving.has(r)).map((r) => ({ points: r.points.map(ft), half: r.width / 2 })),
      lakes: lakes.filter((l) => !leaving.has(l)).map((lake) => this.lakeShape(lake).region.map((polygon) => polygon.map((ring) => ring.map(ft)))),
    };
  }

  // How many of the sketch's rivers and lakes run into each of them: rivers into the lakes they end
  // in and the rivers they carry on as, and lakes into the rivers running out of them.
  inflows() {
    const { rivers, lakes } = this.sketch.water;
    const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * TILE_FT < 2 * LAKE_STEP_FT;
    const cells = new Map(lakes.map((lake) => [lake, new Set(this.lakeShape(lake).cells.map(([i, j]) => `${i},${j}`))]));
    const inLake = (lake, [x, z]) => {
      const [i0, j0] = [Math.round((x * TILE_FT) / LAKE_STEP_FT), Math.round((z * TILE_FT) / LAKE_STEP_FT)];
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (cells.get(lake).has(`${i0 + di},${j0 + dj}`)) return true;
      return false;
    };
    const fed = new Map([...rivers, ...lakes].map((body) => [body, 0]));
    for (const river of rivers) {
      const [start, end] = [river.points[0], river.points.at(-1)];
      for (const lake of lakes) {
        if (inLake(lake, end)) fed.set(lake, fed.get(lake) + 1);
        if (inLake(lake, start)) fed.set(river, fed.get(river) + 1);
      }
      for (const other of rivers) if (other !== river && near(end, other.points[0])) fed.set(other, fed.get(other) + 1);
    }
    return fed;
  }

  // Pours the sketch's water again where the detail step changed the ground beside it (cells:
  // [ci, cj] continent cells), so it runs the way the ground now sends it. A river touched is cut
  // where it was touched and poured on from there; a lake touched is poured again from its seed,
  // with the flow of the rivers running into it, and its outflows go, to be made again. Whatever
  // the pours make joins the sketch. Returns the window's hand-shaped tiles, to work their water
  // out again, or null if nothing was touched.
  reflowWater(cells) {
    const water = this.sketch.water;
    const lattice = new Set(cells.map(([ci, cj]) => `${Math.round(((ci + 0.5) * CELL_FT) / LAKE_STEP_FT)},${Math.round(((cj + 0.5) * CELL_FT) / LAKE_STEP_FT)}`));
    const points = [...lattice].map((k) => k.split(",").map((v) => v * LAKE_STEP_FT));
    // A lake's lattice points, and whether a point (tile units) is within two of them.
    const lakeCells = new Map(water.lakes.map((lake) => [lake, new Set(this.lakeShape(lake).cells.map(([i, j]) => `${i},${j}`))]));
    const nearLake = (lake, [x, z]) => {
      const [i0, j0] = [Math.round((x * TILE_FT) / LAKE_STEP_FT), Math.round((z * TILE_FT) / LAKE_STEP_FT)];
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (lakeCells.get(lake).has(`${i0 + di},${j0 + dj}`)) return true;
      return false;
    };
    const lakes = water.lakes.filter((lake) => points.some(([x, z]) => lakeCells.get(lake).has(`${Math.round(x / LAKE_STEP_FT)},${Math.round(z / LAKE_STEP_FT)}`) || nearLake(lake, [x / TILE_FT, z / TILE_FT])));
    const outflows = new Set(water.rivers.filter((r) => lakes.some((lake) => nearLake(lake, r.points[0]))));
    // Each river touched, and how far along it (ft) it was first touched.
    const cuts = new Map();
    for (const river of water.rivers) {
      if (outflows.has(river) || river.points.length < 2) continue;
      const line = makePolyline(river.points.map((p) => p.map((v) => v * TILE_FT)));
      const reach = river.width / 2 + 2 * CELL_FT;
      for (const [x, z] of points) {
        if (!nearBounds(line, x, z, reach)) continue;
        const n = nearest(line, x, z);
        if (n.dist < reach) cuts.set(river, Math.min(cuts.get(river) ?? Infinity, n.along));
      }
    }
    if (!lakes.length && !cuts.size) return null;
    const fedBefore = this.inflows();

    const sources = [];
    const cutAt = new Map(); // river -> the point it's poured on from
    for (const [river, along] of cuts) {
      // The last of its points before the touch.
      let k = 0;
      let walked = 0;
      for (let n = 1; n < river.points.length; n++) {
        walked += Math.hypot(river.points[n][0] - river.points[n - 1][0], river.points[n][1] - river.points[n - 1][1]) * TILE_FT;
        if (walked >= along) break;
        k = n;
      }
      cutAt.set(river, k);
      sources.push({ id: `river:${river.id}`, at: river.points[k], width: river.width });
    }
    for (const lake of lakes) {
      // Its inflow: the rivers ending in it, or a source's width if none do.
      const q = water.rivers.filter((r) => !outflows.has(r) && nearLake(lake, r.points.at(-1))).reduce((sum, r) => sum + r.width ** 2, 0);
      sources.push({ id: `lake:${lake.id}`, at: lake.seed, width: Math.sqrt(q || DEFAULT_SOURCE_WIDTH_FT ** 2) });
    }
    const leaving = new Set([...cuts.keys(), ...lakes, ...outflows]);
    this.shapeCache = this.shapeCache?.key === this.landHash() ? this.shapeCache : { key: this.landHash(), shape: prepareShape({ land: this.land.data }, this.continent) };
    const result = pourOver({ shape: this.shapeCache.shape, edited: this.editedHeights(), sources, water: this.waterShapes(leaving) });

    // Rivers cut keep their course up to the cut, carried on by the river poured from there.
    const fresh = [...result.rivers];
    for (const [river, k] of cutAt) {
      const kept = river.points.slice(0, k + 1);
      const from = kept.at(-1);
      const on = fresh.findIndex((r) => Math.hypot(r.points[0][0] - from[0], r.points[0][1] - from[1]) * TILE_FT < 2 * LAKE_STEP_FT);
      const carried = on >= 0 ? fresh.splice(on, 1)[0].points.slice(1) : [];
      river.points = [...kept, ...carried];
    }
    water.rivers = water.rivers.filter((r) => !outflows.has(r) && r.points.length >= 2);
    // A lake poured again takes the pool its seed's in; with none, it's drained away.
    const pools = [...result.pools];
    for (const lake of lakes) {
      const p = pools.findIndex(({ region }) => inRegion(lake.seed, region));
      if (p < 0) water.lakes = water.lakes.filter((l) => l !== lake);
      else Object.assign(lake, { seed: pools[p].seed, level: pools.splice(p, 1)[0].level });
    }
    for (const { points, width } of fresh) water.rivers.push({ id: nextWaterId(water, "w"), points, width });
    for (const { seed, level } of pools) water.lakes.push({ id: nextWaterId(water, "l"), seed, level });
    // Water that was fed before and isn't now dries up, and so on down the line.
    for (;;) {
      const fed = this.inflows();
      const dry = new Set([...fed.keys()].filter((body) => fedBefore.get(body) && !fed.get(body)));
      if (!dry.size) break;
      water.rivers = water.rivers.filter((r) => !dry.has(r));
      water.lakes = water.lakes.filter((l) => !dry.has(l));
    }
    this.saveSketch();
    const edited = this.editedTiles();
    return this.detail.keys().filter((key) => edited.has(key));
  }

  // A lake's shape over the ground as it is (world/lakes.js fillLake), kept until the ground or the
  // lake changes.
  lakeShape(lake) {
    const ground = this.groundKey();
    const key = JSON.stringify([ground, lake.seed, lake.level]);
    this.lakeShapes ??= new Map();
    if (!this.lakeShapes.has(key)) {
      if (this.lakeShapes.size > 200) this.lakeShapes.clear();
      if (this.waterAt?.key !== ground) this.waterAt = { key: ground, at: waterGround((x, z) => this.land.heightAt(x, z), this.editedHeights()) };
      this.lakeShapes.set(key, fillLake(this.waterAt.at, lake));
    }
    return this.lakeShapes.get(key);
  }

  // How deep a river cuts below the land as it is: its surface only ever goes down, so where the
  // land rises in its way it runs through a cut. The deepest, in ft.
  riverCut(river) {
    let low = Infinity;
    let deepest = 0;
    for (const [x, z] of river.points) {
      const h = this.land.heightAt(x * TILE_FT, z * TILE_FT);
      low = Math.min(low, h);
      deepest = Math.max(deepest, h - low);
    }
    return Math.round(deepest);
  }

  // A line saying where a poured source's water ended up, and what it would add.
  pourStatus(pin) {
    const el = document.createElement("p");
    const { result } = this.proposal?.pin === pin.id ? this.proposal : {};
    if (!this.proposal || this.proposal.pin !== pin.id) return el;
    if (!result) {
      el.textContent = "Working out where its water goes…";
      return el;
    }
    const ends = {
      water: "Its water reaches the sea or other water.",
      pool: "Its water fills a lake as far as its flow allows, and stops there.",
      flat: "Its water spreads out over flat ground.",
      lost: "Its water wanders too far, and has been cut short.",
    };
    const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    el.textContent = `${ends[result.ends[pin.id]] ?? ""} It would add ${count(result.rivers.length, "river")} and ${count(result.pools.length, "lake")}.`;
    return el;
  }

  // --- roads ---

  // Asks for routes for the paths whose route is missing or was worked out for other pins, widths
  // or land. The land they're routed over is the land grid, biome pins and water.
  updateRoads() {
    const { pins, water } = this.sketch;
    const land = { land: this.land.data, pins: pins.filter((p) => p.kind === "biome"), water };
    this.roadLand = String(hashString(JSON.stringify([this.landHash(), land.pins, land.water, this.continent])));
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
    if (!this.world.files.has(surfacePath(this.continent, Math.floor(x), Math.floor(z)))) {
      this.say("Generate the tiles here before walking on them.");
      this.renderPanel();
      return;
    }
    if (!this.view3d) {
      const [{ RenderView }, { graphicsPanel }] = await Promise.all([import("./renderView.js"), import("./graphicsPanel.js")]);
      this.view3d = new RenderView(this.el.scene, { onGraphics: (graphics) => this.showGraphics?.(graphics), onTime: (clock) => this.showTime?.(clock) });
      this.buildGraphics(graphicsPanel);
      if (!this.showTime) this.buildTime();
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

  // The graphics popover (graphicsPanel.js), under its button.
  buildGraphics(graphicsPanel) {
    this.showGraphics = graphicsPanel(this.el.graphics, this.view3d);
    placeUnder(this.el.graphics, this.el.graphicsButton);
  }

  // The view the time popover sets: the detail step's, or the 3d view's.
  timeView() {
    return this.step === "detail" && this.detail ? this.detail.view : this.view3d;
  }

  // The time popover: sliders for the time of day, the day of the moon's month and how fast time
  // passes while walking, and a button back to the shared clock's time. Its button names the part
  // of the day. It sets the time of whichever view is showing (timeView).
  buildTime() {
    const { timeButton, timePanel, timeOfDay, timeOfDayValue, moonDay, moonDayValue, timeSpeed, timeSpeedValue, timeNow } = this.el;
    moonDay.max = LUNAR_DAYS - 1;
    const day = () => Math.floor(this.timeView().clock.cycles);
    timeOfDay.addEventListener("input", () => this.timeView()?.setTime({ cycles: day() + Number(timeOfDay.value) }));
    moonDay.addEventListener("input", () => {
      const { cycles } = this.timeView().clock;
      const month = Math.floor(cycles / LUNAR_DAYS) * LUNAR_DAYS;
      this.timeView()?.setTime({ cycles: month + Number(moonDay.value) + (cycles - Math.floor(cycles)) });
    });
    timeSpeed.max = TIME_SPEEDS.length - 1;
    timeSpeed.addEventListener("input", () => this.timeView()?.setTime({ speed: TIME_SPEEDS[timeSpeed.value] }));
    timeNow.addEventListener("click", () => this.timeView()?.setTime({ cycles: cyclesAt(Date.now()) }));
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
    if (this.timeView()) this.showTime(this.timeView().clock);
    timePanel.addEventListener("change", (e) => e.target.blur());
    placeUnder(timePanel, timeButton);
  }

  // --- steps and options ---

  // Opening the detail step from a map asks where, as walking does; asking again goes with the
  // last spot. From the detail step it goes back to the last map to ask; from the other 3d steps,
  // which have no map, it opens on the last spot.
  pickDetail() {
    if (this.detailPicking) return this.setStep("detail");
    this.walkPicking = false;
    if (this.step === "detail") this.setStep(this.mapStep ?? "tiles");
    else if (IN_3D.has(this.step)) return this.setStep("detail");
    this.detailPicking = true;
    this.renderPanel();
  }

  // Centres the detail window on continent tile units [x, z].
  detailAt([x, z]) {
    this.detailPicking = false;
    const size = this.detailWindow?.size ?? (Number(this.el.detailSize.value) || 3);
    this.detailWindow = { tx0: Math.floor(x) - Math.floor(size / 2), tz0: Math.floor(z) - Math.floor(size / 2), size };
    this.setStep("detail");
  }

  // Opens a step, with its first tool.
  setStep(step) {
    this.step = step;
    this.detailPicking = false;
    if (!IN_3D.has(step)) this.mapStep = step;
    // Each view writes its own pointer readout.
    this.el.cursor.textContent = "";
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
    this.onStep?.(step);
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
      if (!this.showTime) this.buildTime();
      this.detail = new DetailView(this.el.detail, {
        onMove: (dx, dz) => {
          this.detailWindow.tx0 += dx;
          this.detailWindow.tz0 += dz;
          this.showDetail();
        },
        onEdit: (keys) => this.saveDetail(keys),
        onPointer: (hit) => this.showCursor(hit),
        onSelect: (object) => this.showObject(object),
        onPour: ([x, z]) => this.pour({ id: DETAIL_POUR, at: [x / TILE_FT, z / TILE_FT].map((v) => Math.round(v * 1000) / 1000), width: Number(this.el.pourWidth.value) }),
        bodies: () => this.bodies(),
        onReflow: (cells) => this.reflowWater(cells),
        onSlab: (slabs) => this.showSlab(slabs),
        onProblem: (message, options) => this.say(message, options),
        water: {
          get: () => this.sketch.water,
          set: (water) => {
            this.sketch.water = water;
            this.saveSketch();
          },
        },
      });
      this.detail.view.handlers.onTime = (clock) => this.showTime?.(clock);
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
    this.el.cursor.textContent = hit?.every(Number.isFinite) ? `tile ${Math.floor(hit[0] / TILE_FT)}, ${Math.floor(hit[2] / TILE_FT)} · ${Math.round(hit[1])} ft` : "";
  }

  // The detail step's brush settings, from its panel. Falloff is set as a share of the brush.
  applyDetailBrush() {
    const { detailRadius, detailRadiusValue, detailFalloff, detailFalloffValue, detailStrength, detailStrengthValue, detailErosion, detailTalus } = this.el;
    const radius = Number(detailRadius.value);
    const falloff = Math.max(CELL_FT, (radius * Number(detailFalloff.value)) / 100);
    detailRadiusValue.textContent = `${radius} ft`;
    detailFalloffValue.textContent = `${Math.round(falloff)} ft`;
    detailStrengthValue.textContent = `${detailStrength.value} ft/s`;
    this.el.trailWidthValue.textContent = `${this.el.trailWidth.value} ft`;
    if (this.step !== "detail") return;
    const { channelWidth, channelWidthValue, channelDepth, channelDepthValue, pourWidth, pourWidthValue } = this.el;
    channelWidthValue.textContent = `${channelWidth.value} ft`;
    channelDepthValue.textContent = `${channelDepth.value} ft`;
    pourWidthValue.textContent = `${pourWidth.value} ft`;
    if (this.toolName === "channel") return this.detail?.setBrush({ tool: "channel", width: Number(channelWidth.value), depth: Number(channelDepth.value) });
    if (this.toolName === "water") return this.detail?.setBrush({ tool: "water" });
    if (this.toolName === "objects") return this.detail?.setBrush({ tool: "objects", type: this.pickers.objects.armed });
    if (this.toolName === "structures") return this.detail?.setBrush({ tool: "structures", type: this.pickers.structures.armed });
    if (this.toolName === "slabs") {
      this.fillSlabSwatches();
      return this.detail?.setBrush({ tool: "slabs", settings: this.slabSettings() });
    }
    if (this.toolName === "paint") {
      const { paintTerrain, treeKind, treeSize, paintRadius, paintRadiusValue } = this.el;
      const tree = paintTerrain.value === "tree";
      this.el.treeKindRow.style.display = this.el.treeSizeRow.style.display = tree ? "" : "none";
      paintRadiusValue.textContent = Number(paintRadius.value) ? `${paintRadius.value} ft` : "one cell";
      const terrain = tree ? treeTerrain(treeKind.value, Number(treeSize.value)) : paintTerrain.value;
      return this.detail?.setBrush({ tool: "paint", terrain, radius: Number(paintRadius.value) });
    }
    if (this.toolName === "trails") {
      const { trailKind, trailState, trailWidth } = this.el;
      return this.detail?.setBrush({ tool: "trails", kind: trailKind.value, state: trailState.value, width: Number(trailWidth.value) });
    }
    this.detail?.setBrush({
      tool: this.toolName,
      radius,
      falloff,
      strength: Number(detailStrength.value),
      erosion: detailErosion.value,
      talus: Math.max(5, Math.min(85, Number(detailTalus.value) || 35)),
    });
  }

  // A library's popover and gallery, for "objects" or "structures".
  libraryParts(kind) {
    return kind === "objects" ? [this.el.libraryPopover, this.el.libraryGallery] : [this.el.structurePopover, this.el.structureGallery];
  }

  // The object or structure library (objects/library.js) in a popover over the editor.
  async openLibrary(kind = "objects") {
    const [popover, gallery] = this.libraryParts(kind);
    this.libraries ??= {};
    this.libraryLoading ??= {};
    this.libraryLoading[kind] ??= import("../objects/library.js").then(({ ObjectLibrary }) => {
      this.libraries[kind] = new ObjectLibrary(gallery, {
        kind,
        getWorld: () => this.world,
        onChange: (choose) => {
          this.dirty = true;
          this.loadBuiltObjects(choose);
        },
        placedCount: (types) => placedCount(this.world, types),
        say: (message, options) => {
          this.say(message, options);
          const line = popover.querySelector(".library-message");
          line.textContent = message;
          line.classList.toggle("info", Boolean(options?.info));
        },
      });
    });
    await this.libraryLoading[kind];
    popover.showModal();
    this.libraries[kind].show();
  }

  // Registers the world's built objects (world/objects.js) and lists them to place, choosing
  // `choose` if given. The detail view and an open library draw them again, since they may have
  // changed.
  loadBuiltObjects(choose) {
    adoptStrays(this.world);
    setBuiltObjects(builtObjects(this.world), images(this.world), builtStructures(this.world));
    this.fillObjectTypes(choose);
    if (this.step === "detail" && this.detail) this.showDetail();
    for (const kind of ["objects", "structures"]) if (this.libraryParts(kind)[0].open) this.libraries?.[kind]?.show();
  }

  // The objects and structures tools' pickers, `choose` armed if given; and the object types to
  // replace, by collection, builtins first.
  fillObjectTypes(choose) {
    if (!this.pickers) return;
    const objects = allCollections(this.world, "objects");
    this.pickers.objects.show(objects);
    this.pickers.structures.show(allCollections(this.world, "structures"));
    if (choose) this.pickers[choose.startsWith(STRUCTURE_PREFIX) ? "structures" : "objects"].arm(choose);
    for (const select of [this.el.replaceFrom, this.el.replaceTo]) {
      const collections = objects;
      const was = select.value;
      select.replaceChildren();
      for (const collection of collections) {
        if (!collection.entries.length) continue;
        const g = document.createElement("optgroup");
        g.label = collection.kind === "builtin" ? `builtin: ${collection.name}` : collection.name;
        g.append(...collection.entries.map((e) => new Option(e.name, e.type)));
        select.append(g);
      }
      select.value = was;
      if (!select.value) select.selectedIndex = 0;
    }
  }

  // A scale slider and its readout for a type: feet for the scattered kinds, a factor for built
  // objects.
  scaleSlider(input, output, type, value) {
    const spec = specOf(type);
    const [least, most] = spec?.built || spec?.structure ? spec.size : (spec?.size ?? [1, 1]).map((v, i) => v * [0.5, 2][i]);
    [input.min, input.max, input.step] = [least, most, spec?.built || spec?.structure ? 0.05 : 0.5];
    input.value = value;
    output.textContent = spec?.built || spec?.structure ? `×${value}` : `${value} ft`;
  }

  // Swaps every placed object of type `from` for type `to`, in every continent's tiles, keeping
  // where each stands and which way it faces. Changed tiles are marked edited by hand.
  replaceInstances(from, to) {
    if (!from || !to || from === to) return this.say("Pick two different types.");
    // A structure's placement keeps the ground it pushed down, which nothing else would put back.
    if ([from, to].some((type) => specOf(type)?.structure)) return this.say("Structures can't be swapped this way.");
    const name = (type) => builtOf(type)?.name ?? type;
    if (!window.confirm(`Replace every placed ${name(from)} with ${name(to)}?`)) return;
    const sameKind = from.startsWith(BUILT_PREFIX) === to.startsWith(BUILT_PREFIX);
    const [least, most] = specOf(to).size;
    let count = 0;
    for (const { key: continent } of this.world.info.continents) {
      const edited = loadEdited(this.world.files, continent);
      for (const { tx, tz, path } of surfaceTiles(this.world, continent)) {
        const tile = decodeTile(gunzipSync(this.world.files.get(path)));
        if (!tile.objects?.some((o) => o.type === from)) continue;
        tile.objects = tile.objects.map((o) => {
          if (o.type !== from) return o;
          count++;
          const scale = sameKind ? o.scale : to.startsWith(BUILT_PREFIX) ? 1 : (least + most) / 2;
          return { ...makeObject(to, o.at, o.yaw, scale), id: o.id, ...(o.texts && { texts: o.texts }) };
        });
        this.world.files.set(path, gzipSync(encodeTile(tile)));
        this.details.drop(tx, tz);
        edited.add(`${tx},${tz}`);
      }
      saveEdited(this.world.files, continent, edited);
    }
    this.dirty = true;
    if (this.step === "detail" && this.detail) this.showDetail();
    this.renderPanel();
    this.say(`Replaced ${count} placed ${name(from)} with ${name(to)}.`, { info: true });
  }

  // The slabs tool's panel: what it's doing, and its settings, which also change the picked slabs.
  buildSlabPanel() {
    const tool = () => this.detail?.slabTool;
    this.setSlabMode("pick");
    for (const [button, mode] of [[this.el.slabSelect, "pick"], [this.el.slabFloor, "floor"], [this.el.slabWall, "wall"], [this.el.slabRoom, "room"], [this.el.slabRoof, "roof"]]) button.addEventListener("click", () => this.setSlabMode(mode));
    for (const [button, style] of [[this.el.slabRoofFlat, "flat"], [this.el.slabRoofShed, "shed"], [this.el.slabRoofGable, "gable"], [this.el.slabRoofHip, "hip"]]) {
      button.addEventListener("click", () => {
        this.roofStyle = style;
        this.showSlabRows();
        this.applyDetailBrush();
      });
    }
    this.el.slabRect.addEventListener("click", () => this.setSlabShape("rectangle"));
    this.el.slabPoly.addEventListener("click", () => this.setSlabShape("polygon"));
    this.setSlabShape("rectangle");
    this.el.slabPattern.replaceChildren(new Option("none", ""), ...SLAB_PATTERNS.map((name) => new Option(name, name)));
    this.el.slabTexture.addEventListener("change", () => this.el.slabTexture.value && (this.el.slabPattern.value = ""));
    this.el.slabPattern.addEventListener("change", () => this.el.slabPattern.value && (this.el.slabTexture.value = ""));
    this.el.slabCustomUse.addEventListener("click", () => {
      this.el.slabCustom.close();
      this.setSlabSurface(this.customSlabSurface());
    });
    this.el.slabCustomCancel.addEventListener("click", () => this.el.slabCustom.close());
    this.setSlabSurface("floorboards", { change: false });
    for (const input of [this.el.slabHeight, this.el.slabKeep, this.el.slabConform, this.el.slabPitch, this.el.slabOverhang]) input.addEventListener("change", () => this.applyDetailBrush());
    this.el.slabThickness.addEventListener("change", () => {
      this.applyDetailBrush();
      tool()?.change({ thickness: Number(this.el.slabThickness.value) });
    });
    for (const [button, handle] of [[this.el.slabMove, "move"], [this.el.slabTurn, "turn"]]) {
      button.addEventListener("click", () => {
        tool()?.setHandle(handle);
        this.showSlabRows();
      });
    }
    this.el.slabDelete.addEventListener("click", () => tool()?.remove());
    this.el.slabCut.addEventListener("click", () => (tool()?.cutting ? tool().stopCut() : tool()?.startCut()));
    this.el.slabClearHoles.addEventListener("click", () => tool()?.clearHoles());
    this.el.slabRaise.addEventListener("click", () => tool()?.raiseToRoof());
  }

  // A swatch for each preset, painted as it looks, and a gear for a custom surface; painted when
  // the tool's first used.
  fillSlabSwatches() {
    if (this.el.slabSwatches.children.length) return;
    const words = (name) => name.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);
    const swatches = Object.keys(SLAB_PRESETS).map((name) => {
      const button = Object.assign(document.createElement("button"), { type: "button", className: "slab-swatch", title: words(name) });
      button.dataset.surface = name;
      button.append(swatchCanvas(name));
      button.addEventListener("click", () => this.setSlabSurface(name));
      return button;
    });
    const gear = Object.assign(document.createElement("button"), { type: "button", className: "slab-swatch", title: "custom: a color, with a pattern or a texture", textContent: "⚙" });
    gear.dataset.surface = CUSTOM;
    gear.addEventListener("click", () => this.openSlabCustom());
    this.el.slabSwatches.replaceChildren(...swatches, gear);
    this.setSlabSurface(this.slabSurface, { change: false });
  }

  // The detail step's picked object in the panel, or none.
  showObject(object) {
    const { objectPanel, objectInfo, objectYaw, objectYawValue, objectScale, objectScaleValue } = this.el;
    objectPanel.hidden = !object;
    if (!object) return;
    const spec = specOf(object.type);
    objectInfo.textContent = `${spec?.built?.name ?? spec?.structure?.name ?? object.type} at ${object.at.map(Math.round).join(", ")}`;
    const degrees = Math.round((object.yaw * 180) / Math.PI) % 360;
    // Structures turn in quarter turns, and rise and sink instead of growing.
    const structure = Boolean(spec?.structure);
    [objectYaw.step, objectYaw.max] = structure ? [90, 270] : [5, 355];
    this.el.objectSizeRow.hidden = structure;
    this.el.objectBaseRow.hidden = !structure;
    if (structure) this.el.objectBaseValue.textContent = `${object.base} ft`;
    objectYaw.value = degrees;
    objectYawValue.textContent = `${degrees}°`;
    this.scaleSlider(objectScale, objectScaleValue, object.type, object.scale);
    // A built object's parameter colors, each defaulting to its palette color.
    const palette = spec?.built?.palette ?? [];
    const colors = paletteColors({ palette }, object.colors).filter((_, i) => palette[i].param);
    this.el.objectColors.replaceChildren(
      ...palette
        .filter((p) => p.param)
        .map((p, n) => {
          const input = Object.assign(document.createElement("input"), { type: "color", value: colors[n] });
          input.addEventListener("change", () => this.detail?.changeSelected({ colors: colors.map((c, i) => (i === n ? input.value : c)) }));
          const label = Object.assign(document.createElement("label"), { className: "editor-check" });
          label.append(input, p.name ?? `color ${n + 1}`);
          return label;
        }),
    );
    // Its texts, each saying the type's text until given its own.
    const texts = textsOf(spec?.built ?? { pieces: [] });
    this.el.objectTexts.replaceChildren(
      ...texts.map((text) => {
        const input = Object.assign(document.createElement("input"), { type: "text", value: object.texts?.[text.name] ?? "", placeholder: text.text, maxLength: MAX_TEXT });
        input.addEventListener("change", () => {
          const says = signText(input.value);
          const { [text.name]: _, ...rest } = object.texts ?? {};
          this.detail?.changeSelected({ texts: says ? { ...rest, [text.name]: says } : rest });
        });
        const label = Object.assign(document.createElement("label"), { className: "editor-range" });
        label.append(text.name, input);
        return label;
      }),
    );
  }

  // The slabs tool's settings from the panel: what it does, and what new slabs are like.
  slabSettings() {
    const { slabThickness, slabHeight, slabKeep } = this.el;
    return { mode: this.slabMode, shape: this.slabShape, thickness: Number(slabThickness.value) || 1, height: Number(slabHeight.value) || 10, keepWalling: slabKeep.checked, conform: this.el.slabConform.checked, surface: structuredClone(this.slabSurface), roof: this.roofStyle ?? "gable", pitch: Number(this.el.slabPitch.value) || 30, overhang: Number(this.el.slabOverhang.value) || 0 };
  }

  // Shows only the slabs tool's settings that matter for what it's doing: drawing floors or walls,
  // or picking, with a slab picked or not.
  showSlabRows() {
    const mode = this.slabMode;
    const tool = this.detail?.slabTool;
    const picked = Boolean(tool?.picks.length);
    const rectangleWall = mode === "wall" && this.slabShape === "rectangle";
    this.el.slabKeepRow.hidden = !rectangleWall;
    this.el.slabHeightRow.hidden = !rectangleWall && mode !== "room";
    this.el.slabShapeRow.hidden = ["pick", "room", "roof"].includes(mode) && !tool?.cutting;
    this.el.slabRoofRow.hidden = mode !== "roof";
    this.el.slabPitchRow.hidden = mode !== "roof";
    for (const [button, style] of [[this.el.slabRoofFlat, "flat"], [this.el.slabRoofShed, "shed"], [this.el.slabRoofGable, "gable"], [this.el.slabRoofHip, "hip"]]) button.classList.toggle("active", (this.roofStyle ?? "gable") === style);
    this.el.slabPitch.closest("label").hidden = (this.roofStyle ?? "gable") === "flat";
    this.el.slabConformRow.hidden = mode !== "floor" && mode !== "room";
    this.el.slabHandleRow.hidden = !picked;
    this.el.slabMove.classList.toggle("active", tool?.handle === "move");
    this.el.slabTurn.classList.toggle("active", tool?.handle === "turn");
    // Several slabs picked together only move.
    this.el.slabTurn.disabled = (tool?.picks.length ?? 0) > 1;
    this.el.slabCut.disabled = !tool?.picked;
    this.el.slabCut.classList.toggle("active", Boolean(tool?.cutting));
    this.el.slabClearHoles.disabled = !tool?.picked?.slab.holes;
    this.el.slabRaise.disabled = !tool?.raising().walls.length;
    // Picking with nothing picked, the slab settings change nothing.
    const idle = mode === "pick" && !picked;
    this.el.slabThickness.closest(".editor-row").hidden = idle;
    this.el.slabSwatches.hidden = idle;
  }

  // Picks slabs, or draws floors or walls.
  setSlabMode(mode) {
    this.slabMode = mode;
    this.el.slabSelect.classList.toggle("active", mode === "pick");
    this.el.slabFloor.classList.toggle("active", mode === "floor");
    this.el.slabWall.classList.toggle("active", mode === "wall");
    this.el.slabRoom.classList.toggle("active", mode === "room");
    this.el.slabRoof.classList.toggle("active", mode === "roof");
    this.showSlabRows();
    this.applyDetailBrush();
  }

  // Draws rectangles, dragged corner to corner, or polygons, clicked corner by corner.
  setSlabShape(shape) {
    this.slabShape = shape;
    this.el.slabRect.classList.toggle("active", shape === "rectangle");
    this.el.slabPoly.classList.toggle("active", shape === "polygon");
    this.showSlabRows();
    this.applyDetailBrush();
  }

  // Sets the surface new slabs wear, and the picked slab's, marking its swatch.
  setSlabSurface(surface, { change = true } = {}) {
    this.slabSurface = surface;
    for (const swatch of this.el.slabSwatches.children) swatch.classList.toggle("active", typeof surface === "string" ? swatch.dataset.surface === surface : swatch.dataset.surface === CUSTOM);
    if (!change) return;
    this.applyDetailBrush();
    this.detail?.slabTool.change({ surface: structuredClone(surface) });
  }

  // The world's tiled textures, for a custom slab surface to wear.
  fillSlabTextures() {
    const { slabTexture } = this.el;
    const was = slabTexture.value;
    slabTexture.replaceChildren(new Option("none", ""), ...tiledImages().map((image) => new Option(image.name ?? image.id, image.id)));
    slabTexture.value = was;
  }

  // The custom surface dialog, showing the surface in use when it's custom.
  openSlabCustom() {
    const { slabColor, slabPattern, slabTexture, slabTileEvery } = this.el;
    this.fillSlabTextures();
    const surface = this.slabSurface;
    if (typeof surface === "object") {
      slabColor.value = surface.color;
      slabPattern.value = surface.pattern ?? "";
      slabTexture.value = surface.tile?.image ?? "";
      if (surface.tile) slabTileEvery.value = surface.tile.every;
    }
    this.el.slabCustom.showModal();
  }

  // The surface the custom dialog describes.
  customSlabSurface() {
    const { slabColor, slabPattern, slabTexture, slabTileEvery } = this.el;
    const surface = { color: slabColor.value };
    if (slabTexture.value) surface.tile = { image: slabTexture.value, every: Number(slabTileEvery.value) || 4, jitter: 0.1 };
    else if (slabPattern.value) surface.pattern = slabPattern.value;
    return surface;
  }

  // The picked slabs in the panel, or none. The first's thickness and surface show in the
  // settings, where changing them changes them all.
  showSlab(slabs) {
    const { slabPanel, slabInfo } = this.el;
    slabPanel.hidden = !slabs.length;
    this.showSlabRows();
    if (!slabs.length) return;
    const [slab] = slabs;
    const [x, , z] = slab.at;
    slabInfo.textContent = slabs.length > 1 ? `${slabs.length} slabs` : `slab of ${slab.outline.length} corners, tile ${Math.floor(x / TILE_FT)}, ${Math.floor(z / TILE_FT)}`;
    this.el.slabThickness.value = slab.thickness;
    this.setSlabSurface(structuredClone(slab.surface), { change: false });
    this.detail?.slabTool.setSettings({ thickness: slab.thickness, surface: structuredClone(slab.surface) });
  }

  // What pouring in the detail step would add, with keep and drop, while there's such a proposal.
  showPour() {
    const { pourPanel, pourInfo } = this.el;
    pourPanel.hidden = this.proposal?.pin !== DETAIL_POUR;
    pourInfo.replaceChildren(this.pourStatus({ id: DETAIL_POUR }));
    this.detail?.showProposal(this.proposal?.result ?? null);
  }

  // Writes tiles changed in the detail step back into the world, and marks them edited by hand.
  saveDetail(keys) {
    for (const key of keys) {
      const tile = this.detail.tile(key);
      const [tx, tz] = tile.coords;
      const gz = gzipSync(encodeTile(tile));
      this.world.files.set(surfacePath(this.continent, tx, tz), gz);
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
    const tools = STEPS.detail.tools;
    if (this.toolName === "slabs" && this.detail?.slabTool.key(e)) return true;
    const picked = this.detail?.selected?.object;
    if (/^[0-9]$/.test(e.key) && tools[(Number(e.key) + 9) % 10]) this.setTool(tools[(Number(e.key) + 9) % 10]);
    else if (picked && (e.key === "Delete" || e.key === "Backspace")) this.detail.deleteSelected();
    else if (picked && (e.key === "q" || e.key === "e")) this.detail.changeSelected({ yaw: picked.yaw + ((e.key === "e" ? 1 : -1) * Math.PI) / (picked.base !== undefined ? 2 : 12) });
    else if (picked && this.toolName === "objects" && (e.key === "[" || e.key === "]")) this.detail.changeSelected({ scale: picked.scale * (e.key === "]" ? 1.1 : 1 / 1.1) });
    else if (e.key === "Escape" && this.pickers[this.toolName]?.armed) this.pickers[this.toolName].arm(null);
    else if (e.key === "Escape") this.detail?.cancel();
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
      const held = all.filter((k) => edited.has(k) && this.world.files.has(surfacePath(this.continent, ...k.split(",").map(Number))));
      const skip = overwrite(held) ? new Set() : new Set(held);
      this.generate(regenerateAll, keys(all.filter((k) => !skip.has(k))));
    });
    for (const tab of this.el.stepTabs) tab.addEventListener("click", () => (tab.dataset.step === "detail" ? this.pickDetail() : this.setStep(tab.dataset.step)));
    this.el.openLibrary.addEventListener("click", () => this.openLibrary());
    this.el.openStructures.addEventListener("click", () => this.openLibrary("structures"));
    for (const kind of ["objects", "structures"]) {
      const [popover] = this.libraryParts(kind);
      // Keys stay in the library, away from the editor behind it.
      popover.addEventListener("keydown", (e) => e.stopPropagation());
      popover.querySelector(".library-close").addEventListener("click", () => popover.close());
      popover.addEventListener("close", () => this.libraries?.[kind]?.hide());
    }
    this.el.detailPick.addEventListener("click", () => this.pickDetail());
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
    for (const kind of TRAIL_KINDS) this.el.trailKind.add(new Option(kind, kind));
    for (const state of TRAIL_STATES) this.el.trailState.add(new Option(state, state));
    this.el.trailKind.value = "trail";
    // Each kind starts at its usual width.
    this.el.trailKind.addEventListener("change", () => {
      this.el.trailWidth.value = ROADS[this.el.trailKind.value].width;
      this.applyDetailBrush();
    });
    for (const terrain of [...TERRAIN, "tree"]) this.el.paintTerrain.add(new Option(terrain, terrain));
    for (const kind of TREE_KINDS) this.el.treeKind.add(new Option(kind, kind));
    // A size-N tree's cells are painted as one; painted together, they make N by N trees.
    for (const size of TREE_SIZES) this.el.treeSize.add(new Option(`${size * CELL_FT} ft`, size));
    this.el.treeSize.value = 2;
    for (const input of [this.el.paintTerrain, this.el.treeKind, this.el.treeSize]) input.addEventListener("change", () => this.applyDetailBrush());
    this.el.paintRadius.addEventListener("input", () => this.applyDetailBrush());
    // What the objects and structures tools place, picked from their libraries' thumbnails.
    this.pickers = {
      objects: new PlacePicker(this.el.objectPicker, { onArm: () => this.applyDetailBrush() }),
      structures: new PlacePicker(this.el.structurePicker, { onArm: () => this.applyDetailBrush() }),
    };
    this.fillObjectTypes();
    this.el.replaceOpen.addEventListener("click", () => this.el.replaceDialog.showModal());
    this.el.replaceCancel.addEventListener("click", () => this.el.replaceDialog.close());
    // Closed first, so what replacing says shows in the panel.
    this.el.replaceObjects.addEventListener("click", () => {
      this.el.replaceDialog.close();
      this.replaceInstances(this.el.replaceFrom.value, this.el.replaceTo.value);
    });
    // Dragging a slider is one edit, undone together.
    for (const [input, change] of [
      [this.el.objectYaw, (v) => ({ yaw: (v * Math.PI) / 180 })],
      [this.el.objectScale, (v) => ({ scale: v })],
    ]) {
      input.addEventListener("input", () => {
        if (!this.detail?.edit) this.detail?.beginEdit();
        this.detail?.changeSelected(change(Number(input.value)));
      });
      input.addEventListener("change", () => this.detail?.endEdit());
    }
    this.el.objectDelete.addEventListener("click", () => this.detail?.deleteSelected());
    this.buildSlabPanel();
    for (const [button, way] of [[this.el.objectLower, -1], [this.el.objectRaise, 1]]) {
      button.addEventListener("click", (e) => {
        const object = this.detail?.selected?.object;
        if (object?.base !== undefined) this.detail.changeSelected({ base: object.base + way * (e.shiftKey ? 0.25 : 1) });
      });
    }
    this.el.pourKeep.addEventListener("click", () => this.keepProposal());
    this.el.pourDrop.addEventListener("click", () => this.dropProposal());
    for (const input of [this.el.detailRadius, this.el.detailFalloff, this.el.detailStrength, this.el.detailErosion, this.el.detailTalus, this.el.trailKind, this.el.trailState, this.el.trailWidth, this.el.channelWidth, this.el.channelDepth, this.el.pourWidth]) {
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
      this.detailPicking = false;
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
    for (const tab of this.el.stepTabs) tab.classList.toggle("picking", tab.dataset.step === "detail" && Boolean(this.detailPicking));
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
    hint.textContent = this.walking ? HINT_WALK : this.walkPicking ? HINT_PICK_WALK : this.detailPicking ? HINT_PICK_DETAIL : HINTS[this.step === "water" && this.mode() === "select" ? "water" : this.mode()];
    this.el.graphicsButton.hidden = !this.walking;
    this.el.timeButton.hidden = !this.walking && this.step !== "detail";
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
        this.world.files.set(surfacePath(this.continent, tx, tz), gz);
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
    if (this.step === "tiles" || this.step === "publish" || IN_3D.has(this.step)) return this.step === "heights" ? this.toolName : this.step;
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
    if (this.detailPicking) return { down: (tile) => (this.detailAt(tile), true) };
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
    if ((this.walkPicking || this.detailPicking) && e.key === "Escape") {
      this.walkPicking = this.detailPicking = false;
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
    // Ctrl or cmd and C copy the picked slabs, and V pastes them.
    if (this.step === "detail" && this.toolName === "slabs" && (e.ctrlKey || e.metaKey) && ["c", "v"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      if (e.key.toLowerCase() === "c") this.detail?.slabTool.copy();
      else this.detail?.slabTool.paste();
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
    if (e.key.toLowerCase() === "f" && !this.walking && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.pickDetail();
      return;
    }
    if (e.key.toLowerCase() === "g" && !IN_3D.has(this.step) && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
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
    const tiles = this.step === "tiles" || this.step === "publish" || this.option("tiles");
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

// A preset slab surface's picture, small, for its swatch.
function swatchCanvas(name) {
  const { size, rgba } = presetPixels(name);
  const full = Object.assign(document.createElement("canvas"), { width: size, height: size });
  full.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba), size, size), 0, 0);
  const canvas = Object.assign(document.createElement("canvas"), { width: SWATCH_PX, height: SWATCH_PX });
  canvas.getContext("2d").drawImage(full, 0, 0, SWATCH_PX, SWATCH_PX);
  return canvas;
}
