import { changedTiles } from "./changes.js";
import { FEATURE_HINTS, Features, PINS, STROKES } from "./features.js";
import { MapView } from "./mapView.js";
import { TileGenerator } from "./generation.js";
import { Thumbnails, surfaceTiles, tilePath } from "./thumbnails.js";
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
import { TreeBrush } from "./treeBrush.js";
import { tileRgba } from "../world/tileImage.js";
import { TREE_KINDS, TREE_SIZES } from "../world/trees.js";

const HIT_PX = 8;
const COLORS = {
  active: "#f0c850",
  activeFill: "rgba(240, 200, 80, 0.06)",
  editable: "rgba(240, 200, 80, 0.35)",
  changed: "rgba(255, 130, 40, 0.45)",
  locked: "rgba(255, 255, 255, 0.55)",
  lockedFill: "rgba(255, 255, 255, 0.07)",
};
const HINTS = {
  none: "pick a zone to edit, or make a new one · drag to pan · wheel to zoom",
  empty: "draw the zone's region first",
  draw: "click to add corners · click the first corner or press enter to close · backspace removes the last · esc cancels · right-drag to pan",
  region: "drag corners · shift-click an edge to add a corner · alt-click a corner to remove it · drag elsewhere to pan",
  ...FEATURE_HINTS,
  tree: "click or drag to plant trees on the zone's generated tiles · hold alt to remove them · regenerating a tile clears its trees",
};
const HINT_3D = "drag to orbit · right-drag to pan · wheel to zoom · hover a pin for details · drag the zone's pins and line points to move them · with a pin tool, click the ground to place one · with a tree tool, drag to plant (alt removes)";
const TREE_TOOLS = TREE_SIZES.map((size) => `tree_${size}`);
const treeToolSize = (name) => Number(/^tree_(\d)$/.exec(name)?.[1] ?? 0);
const ALL_KINDS = [...Object.keys(PINS), ...Object.keys(STROKES)];

// The editor's steps, in the order you'd usually work: each has its own tools, and its select tool
// picks only its own kinds of features.
const STEPS = {
  zones: { tools: [], kinds: [] },
  shape: { tools: ["select", "height", "biome"], kinds: ["height", "biome"] },
  features: { tools: ["select", "river", "info"], kinds: ["river", "info"] },
  population: { tools: TREE_TOOLS, kinds: [] },
};

// Ties the map, the side panel and the in-memory world together. One zone at a time is active and
// editable; every other zone on the continent shows but is locked. Step tabs pick what you're
// editing and view tabs how the map shows: cells (the grid and pins), terrain (tile thumbnails)
// or 3D.
export class Editor {
  constructor(world, elements) {
    this.world = world;
    this.el = elements;
    this.continent = world.info.continents[0].key;
    this.zones = [];
    this.active = null;
    this.drawing = null; // corners of a region being drawn
    this.step = "zones";
    this.toolName = "region";
    this.view = "terrain";
    this.features = new Features(this);
    this.palette = new ShapePalette(this, elements);
    this.trees = new TreeBrush(this);
    this.dirty = false;

    this.map = new MapView(elements.map, {
      onPointer: ([x, z]) => (elements.cursor.textContent = `tile ${Math.floor(x)}, ${Math.floor(z)}`),
      drawBase: (ctx, map) => this.drawThumbnails(ctx, map),
      draw: (ctx, map) => this.draw(ctx, map),
      tool: () => this.tool(),
    });

    this.thumbnails = new Thumbnails(() => this.map.render());
    this.generator = new TileGenerator();
    this.generating = false;
    this.pending = new Set(); // "x,z" keys of tiles whose sketch changed since upload or generation
    this.view3d = null; // the RenderView, loaded the first time 3D is shown
    this.showing3d = false;
    this.bindPanel();
    this.fillContinents();
    window.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("beforeunload", (e) => {
      if (this.dirty) e.preventDefault();
    });
    this.showContinent();
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
    this.reload();
    const older = olderZones(this.world, this.continent);
    this.say(older.length ? `Skipped zones in an older format: ${older.join(", ")}.` : "", { info: true });
    this.fitContinent();
    this.refresh3d({ keepCamera: false });
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

  reload() {
    this.zones = listZones(this.world, this.continent);
    if (!this.activeZone) this.active = null;
    this.renderPanel();
    this.renderProps();
    this.map.render();
  }

  // Stores the zone, and marks the tiles the edit changes, within the zone's editable tiles, as
  // needing regeneration.
  save(zone) {
    const before = this.world.readJson(zonePath(this.continent, zone.key));
    const editable = new Set(tilesTouched(zone.region).map(([tx, tz]) => `${tx},${tz}`));
    for (const tile of changedTiles(before, zone)) if (editable.has(tile)) this.pending.add(tile);
    saveZone(this.world, this.continent, zone);
    this.dirty = true;
    this.renderPanel();
    this.map.render();
    this.refreshMarks();
  }

  // Shows the map as cells, terrain or 3D. three.js loads the first time 3D is shown.
  async setView(view) {
    this.view = view;
    this.showing3d = view === "3d";
    if (this.showing3d && !this.view3d) {
      const { RenderView } = await import("./renderView.js");
      this.view3d = new RenderView(this.el.scene, this.sceneHandlers());
    }
    this.el.map.hidden = this.showing3d;
    this.el.scene.hidden = !this.showing3d;
    this.showTip(null);
    this.renderPanel();
    if (this.showing3d) this.refresh3d({ keepCamera: false });
    else this.map.resize();
  }

  // Switches to an editing step, with its first tool.
  setStep(step) {
    this.step = step;
    this.toolName = STEPS[step].tools[0] ?? "region";
    this.features.stroke = null;
    this.features.select(null);
    this.say();
    this.renderPanel();
    this.map.render();
  }

  // The feature kinds the current step edits.
  get kinds() {
    return STEPS[this.step].kinds;
  }

  sceneState() {
    return {
      world: this.world,
      continent: this.continent,
      zones: this.zones,
      active: this.activeZone,
      thumbnails: this.thumbnails,
      selected: this.features.selected,
      pins: this.el.showPins.checked,
      ...this.markKinds(),
    };
  }

  // Which of each zone's features the map shows: on the shape step, the pins the shape filter
  // picks, plus rivers as plain lines when asked; on other steps, everything.
  markKinds() {
    if (this.step !== "shape") return { kinds: ALL_KINDS, lines: [] };
    const show = this.el.shapeShow.find((r) => r.checked)?.value ?? "both";
    return {
      kinds: { both: ["height", "biome"], biomes: ["biome"], heights: ["height"] }[show],
      lines: this.el.showRivers.checked ? ["river"] : [],
    };
  }

  // Rebuilds the 3D view's terrain, for new tiles or a different zone.
  refresh3d({ keepCamera = true } = {}) {
    if (!this.showing3d || !this.view3d) return;
    this.view3d.show(this.sceneState(), { keepCamera });
  }

  // Redraws just the 3D view's outlines and pins, after an edit.
  refreshMarks() {
    if (this.showing3d && this.view3d?.ground) this.view3d.showMarks(this.sceneState());
  }

  // What the pointer does in the 3D view: hover a head for details, drag the active zone's pins and
  // stroke points, click a head to select it, and click the ground to place a pin or deselect.
  sceneHandlers() {
    return {
      hover: (hit, e) => this.showTip(hit, e),
      grab: (hit) => {
        const zone = this.activeZone;
        this.painting = false;
        return zone?.key === hit.zone && this.kinds.includes(this.features.kindOf(zone, hit)) && this.features.grab(zone, hit);
      },
      press: (tile, e) => {
        const zone = this.activeZone;
        if (!zone?.region.length || !this.brushTree() || !tile) return false;
        this.painting = true;
        this.say();
        this.trees.apply(zone, tile, this.brushTree(), e.altKey);
        return true;
      },
      drag: (tile, e) => {
        if (this.painting) {
          this.trees.apply(this.activeZone, tile, this.brushTree(), e.altKey);
        } else {
          this.features.dragTo(tile, this.activeZone);
          this.refreshMarks();
        }
      },
      drop: () => (this.painting ? this.treesDone() : this.features.endDrag(this.activeZone)),
      click: (hit, tile) => {
        const zone = this.activeZone;
        if (!zone?.region.length || hit) return;
        if (PINS[this.toolName] && tile) this.features.addPin(zone, this.toolName, tile, this.palette.pinProps(this.toolName));
        else this.features.select(null);
      },
    };
  }

  // The tree the brush plants, { size, kind }, or null when no tree tool is on.
  brushTree() {
    const size = treeToolSize(this.toolName);
    return size ? { size, kind: this.el.treeKind.value } : null;
  }

  // A tree brush stroke changed a tile: show it right away.
  treesChanged(tx, tz, tile) {
    this.thumbnails.set(tx, tz, tileRgba(tile), tile.cells);
    if (this.showing3d) this.view3d.setTile(tx, tz, tile);
    else this.map.render();
  }

  treesDone() {
    this.painting = false;
    if (!this.trees.finish()) return;
    this.dirty = true;
    this.refresh3d();
  }

  // The details box beside a hovered pin head, or hidden for null.
  showTip(hit, e) {
    const tip = this.el.sceneTip;
    const zone = hit && this.zones.find((z) => z.key === hit.zone);
    const lines = zone && this.features.describe(zone, hit);
    tip.hidden = !lines;
    if (!lines) return;
    tip.textContent = lines.join("\n");
    const box = tip.parentElement.getBoundingClientRect();
    tip.style.left = `${e.clientX - box.left + 14}px`;
    tip.style.top = `${e.clientY - box.top + 14}px`;
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

  // --- panel ---

  bindPanel() {
    const { continent, newZone, zoneName, drawRegion, deleteZone, generate, highlight } = this.el;
    generate.addEventListener("click", () => this.generate(generate, tilesTouched(this.activeZone.region)));
    this.el.regenerate.addEventListener("click", () => this.generate(this.el.regenerate, this.changedHere()));
    highlight.addEventListener("change", () => this.map.render());
    this.el.showBiomes.addEventListener("change", () => this.map.render());
    for (const input of [this.el.showPins, this.el.showRivers, ...this.el.shapeShow]) {
      input.addEventListener("change", () => {
        this.map.render();
        this.refreshMarks();
      });
    }
    for (const tools of this.el.tools) {
      for (const name of STEPS[tools.dataset.tools].tools) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.tool = name;
        const size = treeToolSize(name);
        b.textContent = PINS[name]?.label ?? STROKES[name]?.label ?? (size ? `tree ${size}x${size}` : name);
        b.addEventListener("click", () => this.setTool(name));
        tools.append(b);
      }
    }
    for (const b of this.el.stepTabs.children) b.addEventListener("click", () => this.setStep(b.dataset.step));
    for (const b of this.el.viewTabs.children) b.addEventListener("click", () => this.setView(b.dataset.view));
    for (const kind of TREE_KINDS) this.el.treeKind.add(new Option(kind, kind));

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

  renderPanel() {
    const { zoneList, zoneName, regionInfo, drawRegion, hint } = this.el;
    zoneList.innerHTML = "";
    for (const zone of this.zones) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = zone.name || zone.key;
      button.classList.toggle("active", zone.key === this.active);
      button.addEventListener("click", () => {
        this.active = zone.key === this.active ? null : zone.key;
        this.drawing = null;
        this.features.stroke = null;
        this.features.select(null);
        this.say();
        this.renderPanel();
        this.map.render();
        this.refresh3d({ keepCamera: false });
      });
      item.append(button);
      zoneList.append(item);
    }
    if (!this.zones.length) zoneList.innerHTML = '<li class="editor-empty">no zones yet</li>';

    const zone = this.activeZone;
    for (const b of this.el.stepTabs.children) b.classList.toggle("active", b.dataset.step === this.step);
    for (const b of this.el.viewTabs.children) b.classList.toggle("active", b.dataset.view === this.view);
    for (const section of this.el.steps) section.hidden = !zone || section.dataset.step !== this.step;
    this.el.noZone.hidden = Boolean(zone);
    if (zone) {
      if (document.activeElement !== zoneName) zoneName.value = zone.name;
      const tiles = tilesTouched(zone.region).length;
      regionInfo.textContent = zone.region.length
        ? `${cornerCount(zone.region)} corners · ${tiles} editable tiles`
        : "no region yet";
      drawRegion.textContent = zone.region.length ? "redraw region" : "draw region";
      this.el.generate.disabled = !tiles || this.generating;
      const changed = this.changedHere().length;
      this.el.regenerate.disabled = !changed || this.generating;
      if (!this.generating) this.el.regenerate.textContent = `regenerate ${changed} changed`;
      this.el.pendingInfo.textContent = `${this.pending.size} changed`;
      if (!this.generating) this.el.generate.textContent = `generate ${tiles} tiles`;
      for (const b of this.el.tools.flatMap((t) => [...t.children])) {
        b.classList.toggle("active", b.dataset.tool === this.toolName);
        b.disabled = !zone.region.length;
      }
    }
    hint.textContent = this.showing3d ? HINT_3D : HINTS[this.mode()];
  }

  // The changed tiles the active zone can regenerate.
  changedHere() {
    const zone = this.activeZone;
    if (!zone) return [];
    return tilesTouched(zone.region).filter(([tx, tz]) => this.pending.has(`${tx},${tz}`));
  }

  // Regenerates the given tiles from every zone on the continent, counting progress on `button`.
  async generate(button, tiles) {
    if (!this.activeZone || this.generating || !tiles.length) return;
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
      this.refresh3d();
    }
  }

  renderProps() {
    this.features.renderProps(this.el.props, this.activeZone);
    this.palette.render();
    this.refreshMarks();
  }

  mode() {
    const zone = this.activeZone;
    if (!zone) return "none";
    if (this.drawing) return "draw";
    if (!zone.region.length) return "empty";
    if (this.step === "zones") return "region";
    if (PINS[this.toolName]) return "pin";
    if (STROKES[this.toolName]) return "stroke";
    if (treeToolSize(this.toolName)) return "tree";
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

  // --- tools ---

  tool() {
    const zone = this.activeZone;
    if (!zone) return null;
    if (this.drawing) return this.drawTool(zone);
    if (!zone.region.length) return null;
    if (this.step === "zones") return this.editTool(zone);
    if (treeToolSize(this.toolName)) return this.trees.tool(zone, () => this.brushTree());
    return this.features.tool(zone, this.toolName, this.kinds);
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

  // Corners are addressed as { poly, ring, index } within the region. Every change re-cuts the
  // other zones out of the region when the drag ends.
  editTool(zone) {
    const cornerAt = (tile) => {
      for (const { poly, ring, points } of rings(zone.region)) {
        const index = points.findIndex((p) => this.nearScreen(p, tile));
        if (index >= 0) return { poly, ring, index };
      }
      return null;
    };
    const ringOf = ({ poly, ring }) => zone.region[poly][ring];

    return {
      down: (tile, e) => {
        let corner = cornerAt(tile);
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
        if (!corner && e.shiftKey) {
          const edge = nearestEdge(zone.region, tile);
          if (edge.dist * this.map.view.scale > HIT_PX * this.map.dpr) return false;
          corner = { poly: edge.poly, ring: edge.ring, index: edge.index + 1 };
          ringOf(corner).splice(corner.index, 0, edge.point);
        }
        if (!corner) return false;
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
    const zone = this.activeZone;
    if (e.target.matches("input, textarea, select") || !zone) return;
    if (this.drawing) {
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

  // In the terrain view, every tile's thumbnail; in either 2D view, biomes tinted over the tiles
  // when "show biomes" is on.
  drawThumbnails(ctx, map) {
    if (!this.thumbnails.size) return;
    const terrain = this.view === "terrain";
    const [x0, z0] = map.toTile(0, 0);
    const [x1, z1] = map.toTile(map.canvas.width, map.canvas.height);
    const biomes = this.el.showBiomes.checked;
    ctx.imageSmoothingEnabled = map.view.scale < 64;
    for (let tx = Math.floor(x0); tx <= x1; tx++) {
      for (let tz = Math.floor(z0); tz <= z1; tz++) {
        const image = this.thumbnails.get(tx, tz);
        if (!image) continue;
        const [sx, sy] = map.toScreen([tx, tz]);
        // A hair of overlap hides seams between neighbouring thumbnails.
        if (terrain) ctx.drawImage(image, sx, sy, map.view.scale + 0.5, map.view.scale + 0.5);
        const tint = biomes && this.thumbnails.biome(tx, tz);
        if (!tint) continue;
        ctx.globalAlpha = 0.45;
        ctx.drawImage(tint, sx, sy, map.view.scale + 0.5, map.view.scale + 0.5);
        ctx.globalAlpha = 1;
      }
    }
  }

  draw(ctx, map) {
    const dpr = map.dpr;
    const pins = this.el.showPins.checked;
    for (const zone of this.zones) {
      if (zone.key === this.active) continue;
      this.drawRegion(ctx, map, zone, false);
      if (pins) this.features.draw(ctx, zone, false, this.markKinds());
    }
    const zone = this.activeZone;
    if (!zone) return;

    ctx.strokeStyle = COLORS.editable;
    ctx.lineWidth = dpr;
    for (const [tx, tz] of tilesTouched(zone.region)) {
      const [sx, sy] = map.toScreen([tx, tz]);
      ctx.strokeRect(sx + 2 * dpr, sy + 2 * dpr, map.view.scale - 4 * dpr, map.view.scale - 4 * dpr);
    }
    if (this.el.highlight.checked) {
      ctx.fillStyle = COLORS.changed;
      for (const tile of this.pending) {
        const [sx, sy] = map.toScreen(tile.split(",").map(Number));
        ctx.fillRect(sx, sy, map.view.scale, map.view.scale);
      }
    }
    if (!this.drawing) {
      this.drawRegion(ctx, map, zone, true);
      if (pins) this.features.draw(ctx, zone, true, this.markKinds());
      this.features.drawInProgress(ctx);
      return;
    }

    const pts = this.drawing.map((p) => map.toScreen(p));
    if (map.pointer) pts.push(map.toScreen(this.snap(map.pointer, zone)));
    ctx.strokeStyle = COLORS.active;
    ctx.lineWidth = 2 * dpr;
    polyline(ctx, pts, false);
    this.drawing.forEach((p, i) => handle(ctx, map.toScreen(p), (i === 0 ? 6 : 4) * dpr, COLORS.active));
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
    ctx.fill("evenodd");
    ctx.strokeStyle = active ? COLORS.active : COLORS.locked;
    ctx.lineWidth = (active ? 2 : 1.5) * dpr;
    ctx.setLineDash(active ? [] : [6 * dpr, 4 * dpr]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (active && this.step === "zones") all.flat().forEach((p) => handle(ctx, p, 4 * dpr, COLORS.active));

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
