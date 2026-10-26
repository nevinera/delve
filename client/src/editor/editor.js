import { changedTiles } from "./changes.js";
import { FEATURE_HINTS, Features, PINS, STROKES } from "./features.js";
import { MapView } from "./mapView.js";
import { keyNav } from "./keyNav.js";
import { TileGenerator } from "./generation.js";
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
import { createZone, listZones, olderZones, removeZone, saveZone, zonePath } from "./zones.js";
import { ShapePalette } from "./shapePalette.js";
import { ShapePreview } from "./shapePreview.js";
import { TILE_FT } from "../world/constants.js";

const HIT_PX = 8;
const COLORS = {
  active: "#f0c850",
  activeFill: "rgba(240, 200, 80, 0.06)",
  stale: "rgba(255, 130, 40, 0.45)",
  missing: "rgba(255, 255, 255, 0.16)",
  locked: "rgba(255, 255, 255, 0.55)",
  lockedFill: "rgba(255, 255, 255, 0.07)",
};
const NAV = "drag or W A S D to pan · wheel or C/V to zoom";
const HINTS = {
  none: `pick a zone in the list or on the map to edit its region, or make a new one · ${NAV}`,
  empty: "draw the zone's region first",
  draw: "click to add corners · click the first corner or press enter to close · backspace removes the last · esc cancels · right-drag to pan",
  region: `drag corners · shift-click an edge to add a corner · alt-click a corner to remove it · click another zone to pick it · ${NAV}`,
  ...FEATURE_HINTS,
  tiles: `highlighted tiles are out of date, or not generated yet (faint) · generate brings them all up to date · ${NAV}`,
};
const HINT_ROADS = "roads are drawn and kept, but don't shape the ground yet";
const HINT_WALK = "W/S run · A/D turn · Q/E strafe · space jumps · / walks · X sits · shift sprints · left-drag looks around · right-drag turns · wheel zooms · esc stops walking";
const HINT_PICK_WALK = "click where to start walking · esc cancels";

// The editor's steps, in the order you'd usually work, each with its own map and tools. Only the
// zones step works on one zone at a time; the rest edit every zone at once, each click going to
// the zone it lands in. `map` is what the step draws under its marks: a live preview worked out
// from the zones (shapePreview.js), or the generated tiles.
const STEPS = {
  zones: { tools: [], kinds: [] },
  heights: { tools: ["select", "height"], kinds: ["height"], map: "heights" },
  biomes: { tools: ["select", "biome"], kinds: ["biome"], map: "biomes" },
  features: { tools: ["select", "river", "road", "info"], kinds: ["river", "road", "info"] },
  tiles: { tools: [], kinds: [], map: "tiles" },
};
// With more tiles than this in sight, tiles draw as their thumbnails instead of close up.
const DETAIL_MAX_TILES = 100;
const PREVIEW_DELAY_MS = 80; // after panning or zooming stops, before the preview is redone
const PREVIEW_MARGIN = 0.15; // of the view's size, worked out beyond each edge
const PREVIEW_PX = 3; // screen pixels per preview sample

// Ties the map, the side panel and the in-memory world together. The side panel lists the steps,
// with only the one you're on open.
export class Editor {
  constructor(world, elements) {
    this.world = world;
    this.el = elements;
    this.continent = world.info.continents[0].key;
    this.zones = [];
    this.active = null; // the zone picked on the zones step
    this.drawing = null; // corners of a region being drawn
    this.step = "zones";
    this.toolName = "select";
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

    this.thumbnails = new Thumbnails(() => this.map.render());
    this.details = new TileDetails(
      (tx, tz) => this.world.files.get(tilePath(this.continent, tx, tz)),
      () => this.map.render(),
    );
    this.generator = new TileGenerator();
    this.generating = false;
    this.pending = new Set(); // "x,z" keys of generated tiles whose sketch changed since
    this.previews = new ShapePreview((grid) => this.showPreview(grid));
    this.preview = null; // the latest heights or biomes picture: { step, canvas, grid }
    this.view3d = null; // the RenderView for walking, loaded the first time you walk
    this.bindPanel();
    this.fillContinents();
    window.addEventListener("keydown", (e) => this.onKey(e));
    keyNav((dt, move) => {
      if (!this.walking) this.map.nudge(dt, move);
    });
    this.showContinent();
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
    this.features.stroke = null;
    this.features.select(null);
    this.dirty = false;
    this.pending.clear();
    this.fillContinents();
    this.showContinent();
  }

  // Loads the current continent's thumbnails and zones, and frames them.
  showContinent() {
    this.thumbnails.load(this.world, this.continent);
    this.details.clear();
    this.preview = null;
    this.reload();
    const older = olderZones(this.world, this.continent);
    this.say(older.length ? `Skipped zones in an older format: ${older.join(", ")}.` : "", { info: true });
    this.fitContinent();
  }

  fillContinents() {
    const select = this.el.continent;
    select.innerHTML = "";
    for (const c of this.world.info.continents) select.add(new Option(c.name, c.key));
    select.value = this.continent;
  }

  // Frames the continent's tiles and zones.
  fitContinent() {
    const points = [
      ...surfaceTiles(this.world, this.continent).flatMap(({ tx, tz }) => [[tx, tz], [tx + 1, tz + 1]]),
      ...this.zones.flatMap((z) => rings(z.region).flatMap((r) => r.points)),
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

  zoneByKey(key) {
    return this.zones.find((z) => z.key === key) ?? null;
  }

  // The zone an edit is about: the zone edits are limited to, or else the zone of the stroke being
  // drawn or of the selected feature.
  get focusZone() {
    return this.editZone ?? this.zoneByKey(this.features.stroke?.zone ?? this.features.selected?.zone);
  }

  // The zones you can edit now: every zone with a region.
  scopeZones() {
    return this.zones.filter((z) => z.region.length);
  }

  // Every tile some zone touches, as a set of "tx,tz" keys.
  zoneTiles() {
    this.zoneTileKeys ??= new Set(this.scopeZones().flatMap((z) => tilesTouched(z.region).map(([tx, tz]) => `${tx},${tz}`)));
    return this.zoneTileKeys;
  }

  // Zone tiles that need generating: { stale } ones generated before a change that reaches them,
  // and { missing } ones never generated. Both are lists of "tx,tz" keys.
  outOfDate() {
    const stale = [];
    const missing = [];
    for (const key of this.zoneTiles()) {
      const [tx, tz] = key.split(",").map(Number);
      if (!this.world.files.has(tilePath(this.continent, tx, tz))) missing.push(key);
      else if (this.pending.has(key)) stale.push(key);
    }
    return { stale, missing };
  }

  // The zone whose region holds a point, if any.
  zoneAt(point) {
    return this.zones.find((z) => z.region.length && this.inRegion(point, z)) ?? null;
  }

  reload() {
    this.zones = listZones(this.world, this.continent);
    this.zoneTileKeys = null;
    if (!this.activeZone) this.active = null;
    this.renderPanel();
    this.renderProps();
    this.map.render();
    this.updatePreview();
  }

  // Stores the zone, and marks the generated tiles the edit changes as out of date.
  save(zone) {
    const before = this.world.readJson(zonePath(this.continent, zone.key));
    saveZone(this.world, this.continent, zone);
    this.zoneTileKeys = null;
    const zoned = this.zoneTiles();
    for (const tile of changedTiles(before, zone)) if (zoned.has(tile)) this.pending.add(tile);
    this.dirty = true;
    this.renderPanel();
    this.map.render();
    this.updatePreview();
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
      this.view3d = new RenderView(this.el.scene, { onGraphics: (graphics) => this.showGraphics?.(graphics) });
      this.buildGraphics(SCENE_PARTS, RESOLUTIONS, CLUTTER_RADIUS_FT);
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
    // Under its button, lined up with its left edge.
    this.el.graphics.addEventListener("toggle", (e) => {
      if (e.newState !== "open") return;
      const at = this.el.graphicsButton.getBoundingClientRect();
      Object.assign(this.el.graphics.style, { top: `${at.bottom + 4}px`, left: `${at.left}px` });
    });
  }

  // --- steps and options ---

  // Opens a step, with its first tool.
  setStep(step) {
    this.step = step;
    this.toolName = STEPS[step].tools[0] ?? "select";
    this.drawing = null;
    this.features.stroke = null;
    this.features.select(null);
    this.say();
    this.renderPanel();
    this.map.render();
    this.updatePreview();
  }

  // The feature kinds the current step edits.
  get kinds() {
    return STEPS[this.step].kinds;
  }

  // A checkbox in the current step's section, by its data-option name.
  option(name) {
    return Boolean(this.el.steps.find((s) => s.dataset.step === this.step)?.querySelector(`[data-option=${name}]`)?.checked);
  }

  // Which of each zone's features the map shows: the step's own, plus rivers as plain lines on the
  // biomes step when asked.
  markKinds() {
    return { kinds: this.kinds, lines: this.step === "biomes" && this.option("rivers") ? ["river"] : [] };
  }

  // --- the heights and biomes maps ---

  viewChanged() {
    this.renderScale();
    if (!STEPS[this.step].map || this.step === "tiles") return;
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.updatePreview(), PREVIEW_DELAY_MS);
  }

  // Asks for a fresh heights or biomes map of what's in sight, from the zones as they are now,
  // mid-drag included.
  updatePreview() {
    const kind = STEPS[this.step].map;
    if (kind !== "heights" && kind !== "biomes") return;
    const [x0, z0, x1, z1] = this.map.bounds();
    const [mx, mz] = [(x1 - x0) * PREVIEW_MARGIN, (z1 - z0) * PREVIEW_MARGIN];
    const bounds = [x0 - mx, z0 - mz, x1 + mx, z1 + mz].map((v) => v * TILE_FT);
    const { width, height } = this.map.canvas;
    const side = Math.round((Math.max(width, height) * (1 + 2 * PREVIEW_MARGIN)) / PREVIEW_PX);
    this.previews.request(this.scopeZones(), this.continent, { biomes: kind === "biomes", bounds, side });
  }

  showPreview(grid) {
    if (!grid) {
      this.preview = null;
    } else {
      const canvas = document.createElement("canvas");
      [canvas.width, canvas.height] = [grid.nx, grid.nz];
      canvas.getContext("2d").putImageData(new ImageData(grid.rgba, grid.nx, grid.nz), 0, 0);
      this.preview = { step: grid.biomes ? "biomes" : "heights", canvas, grid };
    }
    this.map.render();
  }

  // --- panel ---

  bindPanel() {
    const { continent, newZone, zoneName, drawRegion, deleteZone, generate, regenerateAll } = this.el;
    generate.addEventListener("click", () => {
      const { stale, missing } = this.outOfDate();
      this.generate(generate, [...stale, ...missing].map((k) => k.split(",").map(Number)));
    });
    regenerateAll.addEventListener("click", () => {
      const tiles = [...this.zoneTiles()].map((k) => k.split(",").map(Number));
      if (window.confirm(`Regenerate all ${tiles.length} tiles? It replaces every generated tile, edits included.`)) this.generate(regenerateAll, tiles);
    });
    for (const section of this.el.steps) {
      section.querySelector(".editor-step-head").addEventListener("click", () => this.setStep(section.dataset.step));
      for (const input of section.querySelectorAll("[data-option]")) input.addEventListener("change", () => this.map.render());
    }
    for (const tools of this.el.tools) {
      for (const name of STEPS[tools.dataset.tools].tools) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.tool = name;
        b.textContent = PINS[name]?.label ?? STROKES[name]?.label ?? name;
        b.addEventListener("click", () => this.setTool(name));
        tools.append(b);
      }
    }
    this.el.zoomIn.addEventListener("click", () => this.map.zoom(1));
    this.el.zoomOut.addEventListener("click", () => this.map.zoom(-1));
    // Walk asks where to start; the next click on the map starts there.
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

    for (const section of this.el.steps) section.classList.toggle("open", section.dataset.step === this.step);
    const zone = this.activeZone;
    this.el.zoneEdit.hidden = !zone;
    if (zone) {
      if (document.activeElement !== zoneName) zoneName.value = zone.name;
      regionInfo.textContent = zone.region.length ? `${cornerCount(zone.region)} corners · ${tilesTouched(zone.region).length} tiles` : "no region yet";
      drawRegion.textContent = zone.region.length ? "redraw region" : "draw region";
    }

    const { stale, missing } = this.outOfDate();
    const todo = stale.length + missing.length;
    this.el.tilesInfo.textContent = `${this.zoneTiles().size} tiles in zones · ${stale.length} out of date · ${missing.length} not generated`;
    this.el.generate.disabled = !todo || this.generating;
    this.el.regenerateAll.disabled = !this.zoneTiles().size || this.generating;
    if (!this.generating) {
      this.el.generate.textContent = todo ? `generate ${todo} tile${todo === 1 ? "" : "s"}` : "all tiles up to date";
      this.el.regenerateAll.textContent = "regenerate every tile";
    }
    for (const b of this.el.tools.flatMap((t) => [...t.children])) {
      b.classList.toggle("active", b.dataset.tool === this.toolName);
      b.disabled = !this.scopeZones().length;
    }
    hint.textContent = this.walking ? HINT_WALK : this.walkPicking ? HINT_PICK_WALK : HINTS[this.mode()] + (this.toolName === "road" ? ` · ${HINT_ROADS}` : "");
    this.el.graphicsButton.hidden = !this.walking;
    this.el.scaleBar.hidden = this.walking;
    this.el.walk.textContent = this.walking ? "stop walking" : this.walkPicking ? "cancel walk" : "walk";
    this.el.walk.classList.toggle("active", Boolean(this.walking || this.walkPicking));
    this.renderScale();
  }

  renderScale() {
    const across = this.map.view.across;
    this.el.scale.textContent = `${across} tile${across === 1 ? "" : "s"} across`;
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
      await this.generator.run(listZones(this.world, this.continent), this.continent, tiles, ({ tx, tz, gz, rgba, biomes, cells }) => {
        this.world.files.set(tilePath(this.continent, tx, tz), gz);
        this.pending.delete(`${tx},${tz}`);
        this.thumbnails.set(tx, tz, rgba, cells, biomes);
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
    this.features.renderProps(this.el.props, this.focusZone);
    this.palette.render();
  }

  mode() {
    if (this.step === "zones") {
      const zone = this.activeZone;
      if (!zone) return "none";
      if (this.drawing) return "draw";
      return zone.region.length ? "region" : "empty";
    }
    if (this.step === "tiles") return "tiles";
    if (!this.scopeZones().length) return "empty";
    if (PINS[this.toolName]) return "pin";
    if (STROKES[this.toolName]) return "stroke";
    return this.toolName;
  }

  setTool(name) {
    this.toolName = name;
    this.features.stroke = null;
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
    if (!this.kinds.length || !this.scopeZones().length) return null;
    return this.worldTool();
  }

  // Each press goes to the zone it's about: the one a stroke is being drawn in, else the one whose
  // feature is under the pointer, else the one the pointer is inside.
  worldTool() {
    let inner = null;
    return {
      down: (tile, e) => {
        this.features.kinds = this.kinds;
        const zone =
          this.zoneByKey(this.features.stroke?.zone) ??
          [...this.zones].reverse().find((z) => this.features.hitAt(z, tile)) ??
          this.zoneAt(tile);
        inner = zone && this.features.tool(zone, this.toolName, this.kinds);
        if (inner) return inner.down(tile, e);
        this.features.select(null);
        if (this.toolName !== "select") this.say("Click inside a zone.");
        return false;
      },
      move: (tile, e) => {
        inner?.move?.(tile, e);
        if (this.features.dragging) this.updatePreview();
      },
      up: (tile, e) => inner?.up?.(tile, e),
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
    const zone = this.focusZone;
    if (e.target.matches("input, textarea, select") || !zone || this.walking) return;
    if (this.drawing && this.editZone) {
      if (e.key === "Enter") this.finishDrawing(zone);
      if (e.key === "Escape") this.drawing = null;
      if (e.key === "Backspace") this.drawing.pop();
    } else if (!this.features.onKey(e, zone)) {
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
    if (!preview || preview.step !== STEPS[this.step].map) return;
    const { grid, canvas } = preview;
    const half = grid.stepFt / 2;
    const [sx, sy] = map.toScreen([(grid.x0 - half) / TILE_FT, (grid.z0 - half) / TILE_FT]);
    const size = (map.view.scale * grid.stepFt) / TILE_FT;
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = tiles ? 0.7 : 1;
    ctx.drawImage(canvas, sx, sy, grid.nx * size, grid.nz * size);
    ctx.globalAlpha = 1;
  }

  // The generated tiles in sight: close up when there are few enough, else as thumbnails. A tile
  // still being drawn close up shows its thumbnail meanwhile.
  drawTiles(ctx, map) {
    const [x0, z0, x1, z1] = map.bounds();
    const [tx0, tz0, tx1, tz1] = [Math.floor(x0), Math.floor(z0), Math.floor(x1), Math.floor(z1)];
    const close = (tx1 - tx0 + 1) * (tz1 - tz0 + 1) <= DETAIL_MAX_TILES;
    this.details.forgetQueued();
    ctx.imageSmoothingEnabled = !close && map.view.scale < 64;
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let tz = tz0; tz <= tz1; tz++) {
        const thumbnail = this.thumbnails.get(tx, tz);
        if (!thumbnail) continue;
        const image = (close && this.details.get(tx, tz)) || thumbnail;
        const [sx, sy] = map.toScreen([tx, tz]);
        // A hair of overlap hides seams between neighbouring tiles.
        ctx.drawImage(image, sx, sy, map.view.scale + 0.5, map.view.scale + 0.5);
      }
    }
  }

  draw(ctx, map) {
    if (this.step === "tiles" && this.option("stale")) this.drawOutOfDate(ctx, map);
    const zonesStep = this.step === "zones";
    const editing = this.editZone;
    if (zonesStep || this.option("boundaries")) {
      for (const zone of this.zones) if (zone !== editing) this.drawRegion(ctx, map, zone, false);
    }
    for (const zone of this.zones) this.features.draw(ctx, zone, true, this.markKinds());
    if (!editing) {
      this.features.drawInProgress(ctx);
      return;
    }
    if (!this.drawing) {
      this.drawRegion(ctx, map, editing, true);
      return;
    }
    const pts = this.drawing.map((p) => map.toScreen(p));
    if (map.pointer) pts.push(map.toScreen(this.snap(map.pointer, editing)));
    ctx.strokeStyle = COLORS.active;
    ctx.lineWidth = 2 * map.dpr;
    polyline(ctx, pts, false);
    this.drawing.forEach((p, i) => handle(ctx, map.toScreen(p), (i === 0 ? 6 : 4) * map.dpr, COLORS.active));
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
    ctx.strokeStyle = active ? COLORS.active : COLORS.locked;
    ctx.lineWidth = (active ? 2 : 1.5) * dpr;
    ctx.setLineDash(active ? [] : [6 * dpr, 4 * dpr]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (active) all.flat().forEach((p) => handle(ctx, p, 4 * dpr, COLORS.active));

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
  ctx.fillStyle = color;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
}
