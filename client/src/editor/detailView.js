import * as THREE from "three";
import { gunzipSync } from "fflate";
import { CELL_FT, CELLS, TILE_FT } from "../world/constants.js";
import { SEA_FLOOR_FT } from "../world/landGrid.js";
import { decodeTile } from "../world/tileCodec.js";
import { detailBrush } from "./detailTools.js";
import { stampTrail } from "./detailTrails.js";
import { carveChannel, traceSource } from "./detailWater.js";
import { FLOW_NONE, encodeFlowDir, encodeFlowSlope } from "../world/generator.js";
import { fellTree, paletteIndex, parseTree } from "../world/trees.js";
import { footprintOf, makeObject, reachOf, specOf, tileOf } from "../world/objects.js";
import { CELL_FT as STRUCTURE_CELL_FT, bakeWalk, placedWalk, pushGround, quartersOf } from "../world/structures.js";
import { meshHeightAt } from "../world/clutter.js";
import { RenderView, boundary, groundSampler } from "./renderView.js";
import { tilePath } from "./thumbnails.js";

// The detail step's 3d view (plans/design.md, "Editor"): a window of generated tiles, `size` a side,
// drawn as the game draws them (renderView.js), for shaping local content cell by cell. An arrow
// off each side of the window moves it a strip of tiles that way. Right-drag turns, middle-drag
// pans and the wheel zooms; the left button is the tools'.
//
// Left-dragging works the brush (detailTools.js) on the window's tiles, a little each frame, or draws
// a trail (detailTrails.js), stamped when it's let go. The objects tool picks an object to drag,
// turn, size or delete, and the place tool puts new ones down. The channel tool digs along a drawn
// line, and the water tool places sources (detailWater.js) or picks one.
//
// A source is kept in its tile's `sources`, as { id, at, flow, free, wet }: wet lists the cells its
// water covers, per tile, with the terrain each had before, so its water can be taken away again.
// Whenever the ground changes, every source in the window runs again. Water that would leave the
// window asks first (onAsk); allowed, it's `free` and runs on into tiles outside, which change too.
//
// Meshes are made again as tiles change, and when an edit ends onEdit hears which tiles it changed,
// to save them. Edits can be undone and redone.
//
// Positions in the scene are feet from the window's middle, as RenderView keeps them.

export const WINDOW_SIZES = [3, 5, 7];
const ARROW = { lengthFt: 70, widthFt: 50, outFt: 70, color: 0xf0c850 };
const SIDES = { east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] };
const CURSOR = { inner: 0xffffff, outer: 0x8fc4ff, trail: 0xe0a060, channel: 0x4aa0e0, selected: 0xffe066, source: 0x3fb6ff, points: 48 };
const SOURCE_PICK_FT = 12; // how near a click picks a source
const DRAWN = new Set(["trails", "channel"]); // tools that draw a line
const TRAIL_STEP_FT = 16; // between the points a drawn trail keeps
const UNDO_KEEP = 50;
// Held-key moves (keyNav.js): panning by this share of the camera's distance a second, zooming and
// turning (radians) this fast, the camera kept between these distances.
const KEYS = { pan: 0.8, zoom: 1.5, turn: 1.5, nearFt: 10, farFt: 20000 };
const MAX_DT = 0.1;

export class DetailView {
  // onMove(dx, dz) hears when an arrow's clicked; onEdit(keys) when tiles ("tx,tz") change;
  // onPointer([x, y, z]) where the pointer's over the ground, in continent feet, or null; onSelect
  // the object picked, or null; onSource the source picked, or null; onAsk(question) is answered
  // true or false; onSay(message) tells the author something.
  constructor(canvas, { onMove, onEdit, onPointer, onSelect, onSource, onAsk, onSay } = {}) {
    this.canvas = canvas;
    this.view = new RenderView(canvas);
    const { controls } = this.view;
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    controls.screenSpacePanning = false;
    this.arrows = new THREE.Group();
    this.cursor = new THREE.Group();
    this.view.scene.add(this.arrows, this.cursor);
    this.onMove = onMove;
    this.onEdit = onEdit;
    this.onPointer = onPointer;
    this.onSelect = onSelect;
    this.onSource = onSource;
    this.onAsk = onAsk;
    this.onSay = onSay;
    this.source = null; // { source, key }: the source picked
    this.extra = new Map(); // tiles outside the window and its ring, loaded for water running there
    this.sourceMarks = new THREE.Group();
    this.view.scene.add(this.sourceMarks);
    this.selected = null; // { object, key }: the object picked and the tile listing it
    this.dragging = false;
    this.dirtyObjects = new Set(); // "tx,tz" whose objects alone need making again
    this.shown = false;
    this.brush = null;
    this.stroke = null; // a brush being dragged
    this.trail = null; // a trail being drawn: its points so far, continent feet
    this.edit = null; // the tiles an edit's changing, "tx,tz" -> their state before
    this.pointer = null;
    this.dirty = new Set(); // "tx,tz" of meshes to make again
    this.undos = [];
    this.redos = [];
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const side = this.arrowAt(e);
      if (side) return this.onMove?.(...SIDES[side]);
      const at = this.pointAt(e);
      if (!at || !this.brush) return;
      canvas.setPointerCapture(e.pointerId);
      if (this.brush.tool === "objects" || this.brush.tool === "structures") {
        // The objects tool reaches past structures, to put things on their floors.
        const objects = this.brush.tool === "objects";
        const picked = this.objectAt(e, objects);
        // Clicking the ground, or a structure's floor, places what's armed, if anything.
        if (!picked && this.brush.type) return this.place((objects && this.objectAt(e)?.point) || at);
        this.select(picked);
        if (picked) {
          this.beginEdit();
          const [x, z] = picked.object.at;
          this.dragging = { dx: x - at[0], dz: z - at[1] };
        }
        return;
      }
      if (this.brush.tool === "paint") {
        this.beginEdit();
        this.painting = true;
        return this.paint(at);
      }
      if (this.brush.tool === "water") return this.water(at);
      if (DRAWN.has(this.brush.tool)) {
        this.trail = [at];
        return;
      }
      const from = this.cells().height(Math.floor(at[0] / CELL_FT), Math.floor(at[1] / CELL_FT));
      this.beginEdit();
      this.stroke = { from, last: performance.now() };
    });
    canvas.addEventListener("pointermove", (e) => {
      this.pointer = e;
      const over = Boolean(this.arrowAt(e));
      canvas.style.cursor = over ? "pointer" : "";
      const at = !over && this.pointAt(e);
      if (this.trail && at && Math.hypot(at[0] - this.trail.at(-1)[0], at[1] - this.trail.at(-1)[1]) >= TRAIL_STEP_FT) this.trail.push(at);
      if (this.dragging && at) this.moveSelected([at[0] + this.dragging.dx, at[1] + this.dragging.dz]);
      if (this.painting && at) this.paint(at);
      this.hover(over ? null : this.groundAt(e));
    });
    canvas.addEventListener("pointerleave", () => this.stroke || this.trail || this.dragging || this.hover(null));
    for (const type of ["pointerup", "pointercancel"]) canvas.addEventListener(type, (e) => this.release(type === "pointercancel"));
  }

  // brush: { tool, radius, falloff, strength, erosion, talus } (detailTools.js), or for the trail
  // tool, { tool: "trails", kind, state, width } (detailTrails.js).
  setBrush(brush) {
    this.brush = brush;
    if (this.pointer) this.hover(this.groundAt(this.pointer));
  }

  // The cursor and the height readout, for the ground under the pointer.
  hover(hit) {
    this.drawCursor(hit);
    this.onPointer?.(hit && [hit.x + this.view.origin[0], hit.y, hit.z + this.view.origin[1]]);
  }

  // The left button's let go: a brush stroke ends, and a trail's stamped (or dropped, if `cancel`).
  release(cancel = false) {
    if (this.painting) {
      this.painting = false;
      this.endEdit();
    }
    if (this.stroke || this.dragging) {
      if (this.stroke) this.reflow();
      this.stroke = null;
      this.dragging = false;
      this.endEdit();
    }
    const trail = this.trail;
    this.trail = null;
    if (trail && !cancel && trail.length >= 2 && this.brush.tool === "channel") {
      this.beginEdit();
      this.setHeights(carveChannel(this.cells(), trail, this.brush));
      this.reflow();
      this.endEdit();
    } else if (trail && !cancel && trail.length >= 2) {
      this.beginEdit();
      const editable = new Set(this.keys());
      const { kind, state, width } = this.brush;
      // Snapshots every tile the trail could reach first, since stamping changes them in place.
      for (const key of editable) if (this.view.decoded.has(key)) this.touch(key);
      const changed = stampTrail(this.view.decoded, (key) => editable.has(key), { kind, state, width }, trail);
      for (const key of [...this.edit.keys()]) if (!changed.includes(key)) this.edit.delete(key);
      this.changed(changed);
      this.reflow();
      this.endEdit();
    }
    if (this.pointer) this.hover(this.groundAt(this.pointer));
  }

  // Drops a trail half drawn.
  cancel() {
    if (this.trail) this.release(true);
  }

  // Loads the window of tiles whose north-west tile is (tx0, tz0), `size` a side, from
  // state.world's files, keeping the camera where it was over the ground.
  show(state, [tx0, tz0], size) {
    const view = this.view;
    const before = view.origin;
    view.stopWalk();
    view.streaming = null;
    view.clear();
    view.decoded = new Map();
    view.clutterTiles.clear();
    view.clutterAround = null;
    view.sightTile = null;
    view.origin = [(tx0 + size / 2) * TILE_FT, (tz0 + size / 2) * TILE_FT];
    view.ground = groundSampler(view.decoded, view.origin);
    this.window = { tx0, tz0, size, world: state.world, continent: state.continent };
    this.release(true);
    this.select(null);
    this.pickSource(null);
    this.extra = new Map();
    this.dirty.clear();
    this.dirtyObjects.clear();
    // Undoing reaches only tiles still loaded, so moving the window starts afresh.
    this.undos = [];
    this.redos = [];

    // The window's tiles, and a ring round it so the seams at its edge close.
    for (let tz = tz0 - 1; tz <= tz0 + size; tz++) {
      for (let tx = tx0 - 1; tx <= tx0 + size; tx++) {
        const bytes = state.world.files.get(tilePath(state.continent, tx, tz));
        if (!bytes) continue;
        try {
          view.decoded.set(`${tx},${tz}`, decodeTile(gunzipSync(bytes)));
        } catch (err) {
          console.warn(`couldn't read tile ${tx},${tz}: ${err.message}`);
        }
      }
    }
    const keys = this.keys().filter((key) => view.decoded.has(key));
    for (const key of keys) {
      view.buildGround(key);
      view.addTrees(view.decoded.get(key));
      view.addObjects(view.decoded.get(key));
    }
    view.materials();
    view.buildOcean(keys);
    this.drawFrame();
    this.drawSources();

    const { controls, camera } = view;
    if (!before) {
      const y = view.ground(0, 0) || 0;
      controls.target.set(0, y, 0);
      // Far enough back that the whole window and its arrows show.
      camera.position.set(0, y + size * TILE_FT * 1.1, size * TILE_FT * 1.0);
    } else {
      // Same place in the world as before, now nearer the middle by however far the window moved.
      const [dx, dz] = [before[0] - view.origin[0], before[1] - view.origin[1]];
      controls.target.x += dx;
      controls.target.z += dz;
      camera.position.x += dx;
      camera.position.z += dz;
    }
    controls.update();
    view.resize();
    this.start();
  }

  // The loaded tiles' cells as detailTools.js takes them, in continent cells. Only the window's
  // generated tiles can be edited; ground past what's loaded reads as sea floor.
  cells() {
    const { decoded } = this.view;
    const { tx0, tz0, size } = this.window;
    const tileOf = (ci, cj) => [Math.floor(ci / CELLS), Math.floor(cj / CELLS)];
    return {
      height: (ci, cj) => {
        const [tx, tz] = tileOf(ci, cj);
        const tile = decoded.get(`${tx},${tz}`);
        return tile ? tile.layers.height[(cj - tz * CELLS) * CELLS + ci - tx * CELLS] : SEA_FLOOR_FT;
      },
      editable: (ci, cj) => {
        const [tx, tz] = tileOf(ci, cj);
        return tx >= tx0 && tz >= tz0 && tx < tx0 + size && tz < tz0 + size && decoded.has(`${tx},${tz}`);
      },
    };
  }

  // Sets cells' heights, [[ci, cj, h], ...], within the edit under way.
  setHeights(changes) {
    const touched = new Set();
    for (const [ci, cj, h] of changes) {
      const [tx, tz] = [Math.floor(ci / CELLS), Math.floor(cj / CELLS)];
      const key = `${tx},${tz}`;
      this.touch(key);
      this.view.decoded.get(key).layers.height[(cj - tz * CELLS) * CELLS + ci - tx * CELLS] = h;
      touched.add(key);
    }
    this.changed(touched);
  }

  // Marks the meshes changed tiles reach to be made again: a tile's own, and those west and north
  // of it, which reach over into it to close their seams.
  changed(keys) {
    const shown = new Set(this.keys());
    for (const key of keys) {
      const [tx, tz] = key.split(",").map(Number);
      for (const near of [key, `${tx - 1},${tz}`, `${tx},${tz - 1}`, `${tx - 1},${tz - 1}`]) {
        if (shown.has(near) && this.view.decoded.has(near)) this.dirty.add(near);
      }
    }
  }

  // One frame of the brush stroke under the pointer.
  work(now) {
    const { stroke } = this;
    const dt = Math.min(MAX_DT, (now - stroke.last) / 1000);
    stroke.last = now;
    const at = this.pointer && this.pointAt(this.pointer);
    if (!at || !dt) return;
    this.setHeights(detailBrush(this.cells(), this.brush, at, dt, stroke.from));
  }

  // Edits are kept for undoing as each changed tile's state before and after.
  beginEdit() {
    this.edit = new Map();
  }

  // Keeps a tile's state before the edit under way first changes it.
  touch(key) {
    if (this.edit && !this.edit.has(key)) this.edit.set(key, snapshot(this.tile(key)));
  }

  // A generated tile, from those shown, those loaded for water outside the window, or the world's
  // files. Undefined where there's none.
  tile(key) {
    let tile = this.view.decoded.get(key) ?? this.extra.get(key);
    if (tile || !this.window) return tile;
    const [tx, tz] = key.split(",").map(Number);
    const bytes = this.window.world.files.get(tilePath(this.window.continent, tx, tz));
    if (!bytes) return undefined;
    try {
      tile = decodeTile(gunzipSync(bytes));
    } catch (err) {
      console.warn(`couldn't read tile ${key}: ${err.message}`);
      return undefined;
    }
    this.extra.set(key, tile);
    return tile;
  }

  endEdit() {
    const edit = this.edit;
    this.edit = null;
    if (!edit?.size) return;
    const after = new Map([...edit.keys()].map((key) => [key, snapshot(this.tile(key))]));
    this.undos.push({ before: edit, after });
    if (this.undos.length > UNDO_KEEP) this.undos.shift();
    this.redos = [];
    this.freshClutter(edit.keys());
    this.onEdit?.([...edit.keys()]);
  }

  // Clutter for changed tiles is worked out again, for their heights and the structures on them.
  freshClutter(keys) {
    for (const key of keys) this.view.clutterTiles.delete(key);
    this.view.clutterAround = null;
  }

  undo() {
    this.replay(this.undos, this.redos, "before");
  }

  redo() {
    this.replay(this.redos, this.undos, "after");
  }

  replay(from, to, side) {
    if (this.stroke || this.trail || this.dragging || this.painting || !from.length) return;
    this.select(null);
    const entry = from.pop();
    to.push(entry);
    this.pickSource(null);
    for (const [key, state] of entry[side]) restore(this.tile(key), state);
    this.changed(entry[side].keys());
    this.freshClutter(entry[side].keys());
    this.drawSources();
    this.onEdit?.([...entry[side].keys()]);
  }

  // Held-key moves from keyNav.js: W A S D pan across the ground, C and V zoom, Q and E turn.
  nudge(dt, { x, z, zoom, turn }) {
    const { camera, controls } = this.view;
    const { target } = controls;
    const offset = camera.position.clone().sub(target);
    const distance = offset.length();
    const forward = new THREE.Vector3(-offset.x, 0, -offset.z).normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    target.add(forward.multiplyScalar(-z).add(right.multiplyScalar(x)).multiplyScalar(distance * KEYS.pan * dt));
    if (turn) offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * KEYS.turn * dt);
    if (zoom) offset.multiplyScalar(THREE.MathUtils.clamp(distance * Math.exp(-zoom * KEYS.zoom * dt), KEYS.nearFt, KEYS.farFt) / distance);
    camera.position.copy(target).add(offset);
    controls.update();
    if (this.pointer) this.hover(this.groundAt(this.pointer));
  }

  // --- water ---

  // The sources listed by the window's tiles, each as { source, key }.
  sources() {
    return this.keys().flatMap((key) => (this.view.decoded.get(key)?.sources ?? []).map((source) => ({ source, key })));
  }

  // A click with the water tool: picks the source there, or places a new one.
  water(at) {
    const near = this.sources().find(({ source }) => Math.hypot(source.at[0] - at[0], source.at[1] - at[1]) < SOURCE_PICK_FT);
    if (near) return this.pickSource(near);
    const key = tileOf(at).join(",");
    if (!this.editable(key)) return;
    const source = { id: `${key.replace(",", ".")}.${Math.random().toString(36).slice(2, 8)}`, at: at.map((v) => Math.round(v * 10) / 10), flow: this.brush.flow, free: false, wet: {} };
    const run = this.run(source, true);
    if (!run) return;
    this.beginEdit();
    this.touch(key);
    const tile = this.view.decoded.get(key);
    tile.sources = [...(tile.sources ?? []), source];
    this.wet(source, run.wet, run.end);
    this.endEdit();
    this.pickSource({ source, key });
  }

  // Where a source's water goes, as traceSource has it. Water that would leave the window asks
  // whether it may (if `ask`), and runs on if so, the source becoming free; null if it may not.
  // Without asking, water from a source that isn't free stops at the window's edge.
  run(source, ask = false) {
    const [ci, cj] = source.at.map((v) => Math.floor(v / CELL_FT));
    const trace = (free) => traceSource(this.waterCells(free), [ci, cj], source.flow);
    let result = trace(source.free);
    if (result.end === "outside" && !source.free) {
      if (!ask) {
        this.onSay?.("Water from a source now reaches the window's edge, and stops there. Pick the source and let it run on, if it should.");
        return result;
      }
      if (!this.onAsk?.("This water would run out of the window. Let it run on to where it ends? Tiles it reaches outside the window will be marked as edited.")) return null;
      source.free = true;
      result = trace(true);
    }
    return result;
  }

  // The cells as traceSource takes them: water may go anywhere in the window, or anywhere there's a
  // generated tile if `free`.
  waterCells(free) {
    const shown = new Set(this.keys());
    const at = (ci, cj) => {
      const [tx, tz] = [Math.floor(ci / CELLS), Math.floor(cj / CELLS)];
      const key = `${tx},${tz}`;
      const tile = free || shown.has(key) ? this.tile(key) : this.view.decoded.get(key);
      return { key, tile, k: (cj - tz * CELLS) * CELLS + ci - tx * CELLS };
    };
    return {
      height: (ci, cj) => {
        const { tile, k } = at(ci, cj);
        return tile ? tile.layers.height[k] : SEA_FLOOR_FT;
      },
      water: (ci, cj) => {
        const { tile, k } = at(ci, cj);
        return Boolean(tile) && !Number.isNaN(tile.layers.water[k]);
      },
      inside: (ci, cj) => {
        const { key, tile } = at(ci, cj);
        return Boolean(tile) && (free || shown.has(key));
      },
    };
  }

  // Puts a source's water down, keeping the terrain under it in source.wet, and how it ends
  // (traceSource) in source.end.
  wet(source, cells, end) {
    source.end = end;
    const fresh = (tile) => {
      tile.palettes.water ??= ["sea", "fresh"];
      if (!tile.palettes.water.includes("fresh")) tile.palettes.water.push("fresh");
      return tile.palettes.water.indexOf("fresh");
    };
    const changed = new Set();
    for (const [cell, { surface, dir, slope }] of cells) {
      const [ci, cj] = cell.split(",").map(Number);
      const [tx, tz] = [Math.floor(ci / CELLS), Math.floor(cj / CELLS)];
      const key = `${tx},${tz}`;
      const tile = this.tile(key);
      this.touch(key);
      const [i, j] = [ci - tx * CELLS, cj - tz * CELLS];
      const k = j * CELLS + i;
      const { layers, palettes } = tile;
      if (parseTree(palettes.terrain[layers.terrain[k]])) fellTree(tile, i, j);
      if (!layers.waterKind) {
        // Without the layer, water at 0 ft was sea and the rest fresh (terrainMesh.js kindOf).
        const sea = Math.max(0, (palettes.water ??= ["sea", "fresh"]).indexOf("sea"));
        const freshKind = fresh(tile);
        layers.waterKind = Uint8Array.from(layers.water, (w) => (w === 0 ? sea : freshKind));
      }
      layers.flowDir ??= new Uint8Array(CELLS * CELLS).fill(FLOW_NONE);
      layers.flowSlope ??= new Uint8Array(CELLS * CELLS);
      (source.wet[key] ??= []).push([k, palettes.terrain[layers.terrain[k]]]);
      layers.water[k] = Math.round(surface * 4) / 4;
      layers.waterKind[k] = fresh(tile);
      layers.terrain[k] = paletteIndex(tile, "mud");
      layers.flowDir[k] = dir ? encodeFlowDir(...dir) : FLOW_NONE;
      layers.flowSlope[k] = dir ? encodeFlowSlope(slope) : 0;
      changed.add(key);
    }
    this.changed(changed);
  }

  // Takes a source's water away again.
  dry(source) {
    const changed = new Set();
    for (const [key, list] of Object.entries(source.wet ?? {})) {
      const tile = this.tile(key);
      if (!tile) continue;
      this.touch(key);
      for (const [k, terrain] of list) {
        tile.layers.water[k] = NaN;
        tile.layers.terrain[k] = paletteIndex(tile, terrain);
        if (tile.layers.flowDir) tile.layers.flowDir[k] = FLOW_NONE;
        if (tile.layers.flowSlope) tile.layers.flowSlope[k] = 0;
      }
      changed.add(key);
    }
    source.wet = {};
    this.changed(changed);
  }

  // Runs every source in the window again, within the edit under way, after the ground's changed.
  reflow() {
    const all = this.sources();
    if (!all.length) return;
    for (const { key } of all) this.touch(key);
    for (const { source } of [...all].reverse()) this.dry(source);
    for (const { source } of all) {
      const run = this.run(source);
      this.wet(source, run.wet, run.end);
    }
  }

  pickSource(picked) {
    this.source = picked;
    this.drawSources();
    this.onSource?.(picked?.source ?? null);
  }

  // Changes the picked source's flow, or lets its water leave the window (`free`).
  changeSource({ flow, free }) {
    const { source: picked } = this;
    if (!picked) return;
    const { source, key } = picked;
    const was = { flow: source.flow, free: source.free };
    this.beginEdit();
    this.touch(key);
    this.dry(source);
    if (flow !== undefined) source.flow = flow;
    if (free) source.free = true;
    const run = this.run(source, true);
    if (!run) {
      // Back as it was.
      Object.assign(source, was);
      const back = this.run(source);
      this.wet(source, back.wet, back.end);
    } else this.wet(source, run.wet, run.end);
    this.endEdit();
    this.onSource?.(source);
  }

  removeSource() {
    const { source: picked } = this;
    if (!picked) return;
    this.beginEdit();
    this.touch(picked.key);
    this.dry(picked.source);
    const tile = this.view.decoded.get(picked.key);
    tile.sources = tile.sources.filter((s) => s !== picked.source);
    this.endEdit();
    this.pickSource(null);
  }

  // A ring at each source in the window, the picked one highlighted.
  drawSources() {
    for (const child of [...this.sourceMarks.children]) {
      child.geometry.dispose();
      child.material.dispose();
      this.sourceMarks.remove(child);
    }
    if (!this.window) return;
    for (const { source } of this.sources()) {
      const picked = source === this.source?.source;
      const r = picked ? 8 : 5;
      const points = Array.from({ length: 16 }, (_, n) => {
        const a = (n / 16) * Math.PI * 2;
        return [(source.at[0] + Math.cos(a) * r) / TILE_FT, (source.at[1] + Math.sin(a) * r) / TILE_FT];
      });
      const line = boundary(points, this.view.ground, this.view.origin, picked ? CURSOR.selected : CURSOR.source);
      line.material.depthTest = false;
      line.renderOrder = 4;
      this.sourceMarks.add(line);
    }
  }

  // --- objects ---

  // The object under a pointer event, as { object, key, point: [x, z] continent feet where the
  // pointer meets it }, or null. `pastStructures` passes over structures.
  objectAt(e, pastStructures = false) {
    const r = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.view.camera);
    const shown = new Set(this.keys());
    for (const hit of ray.intersectObjects(this.view.objects.children, false)) {
      const object = hit.object.userData.objects?.[hit.instanceId];
      const key = hit.object.userData.tile?.join(",");
      if (pastStructures && object && specOf(object.type)?.structure) continue;
      if (object && shown.has(key)) return { object, key, point: [hit.point.x + this.view.origin[0], hit.point.z + this.view.origin[1]] };
    }
    return null;
  }

  select(picked) {
    this.selected = picked;
    this.drawSelection();
    this.onSelect?.(picked?.object ?? null);
  }

  // Whether a tile in the window can be edited.
  editable(key) {
    return this.keys().includes(key) && this.view.decoded.has(key);
  }

  // Paints the paint tool's terrain on the cells within its radius of [x, z] (the cell there,
  // at least), within the edit under way. Trees aren't painted into water.
  paint([x, z]) {
    const { terrain, radius } = this.brush;
    const tree = Boolean(parseTree(terrain));
    const changed = new Set();
    const reach = Math.ceil(radius / CELL_FT);
    const [ci0, cj0] = [Math.floor(x / CELL_FT), Math.floor(z / CELL_FT)];
    for (let cj = cj0 - reach; cj <= cj0 + reach; cj++) {
      for (let ci = ci0 - reach; ci <= ci0 + reach; ci++) {
        const middle = Math.hypot((ci + 0.5) * CELL_FT - x, (cj + 0.5) * CELL_FT - z);
        if (middle > radius && (ci !== ci0 || cj !== cj0)) continue;
        const key = `${Math.floor(ci / CELLS)},${Math.floor(cj / CELLS)}`;
        if (!this.editable(key)) continue;
        const [tx, tz] = key.split(",").map(Number);
        const tile = this.view.decoded.get(key);
        const k = (cj - tz * CELLS) * CELLS + ci - tx * CELLS;
        if (tree && !Number.isNaN(tile.layers.water[k])) continue;
        if (tile.palettes.terrain[tile.layers.terrain[k]] === terrain) continue;
        this.touch(key);
        tile.layers.terrain[k] = paletteIndex(tile, terrain);
        changed.add(key);
      }
    }
    this.changed(changed);
  }

  // Puts a new object of the armed type down at [x, z]: as built, or in the middle of its sizes.
  place(at) {
    const key = tileOf(at).join(",");
    if (!this.editable(key)) return;
    const { type } = this.brush;
    const spec = specOf(type);
    if (!spec) return;
    const { structure } = spec;
    const scale = spec.built || structure ? 1 : (spec.size[0] + spec.size[1]) / 2;
    const object = { ...makeObject(type, at, structure ? 0 : Math.random() * Math.PI * 2, scale), id: `${key.replace(",", ".")}.${Math.random().toString(36).slice(2, 8)}` };
    this.beginEdit();
    this.touch(key);
    const tile = this.view.decoded.get(key);
    tile.objects = [...(tile.objects ?? []), object];
    this.dirtyObjects.add(key);
    if (structure) {
      object.base = this.highestUnder(object, structure);
      this.settle(object, structure);
    }
    this.endEdit();
    this.select({ object, key });
  }

  // Moves the selected object to [x, z], into another tile's list if it crosses into one. It
  // won't leave the window.
  moveSelected(at) {
    const { selected } = this;
    const key = tileOf(at).join(",");
    if (!selected || !this.editable(key)) return;
    this.touch(selected.key);
    if (key !== selected.key) {
      this.touch(key);
      const from = this.view.decoded.get(selected.key);
      from.objects = from.objects.filter((o) => o !== selected.object);
      const to = this.view.decoded.get(key);
      to.objects = [...(to.objects ?? []), selected.object];
      this.dirtyObjects.add(selected.key);
      selected.key = key;
    }
    const structure = specOf(selected.object.type)?.structure;
    if (structure) {
      const snapped = at.map((v) => Math.round(v / STRUCTURE_CELL_FT) * STRUCTURE_CELL_FT);
      const moved = snapped.some((v, i) => v !== selected.object.at[i]);
      selected.object.at = snapped;
      if (moved) this.settle(selected.object, structure);
    } else selected.object.at = at.map((v) => Math.round(v * 10) / 10);
    this.dirtyObjects.add(key);
    this.drawSelection();
    this.onSelect?.(selected.object);
  }

  // Changes the selected object: { yaw } in radians, { scale } in feet (a factor for built
  // objects), { colors } (a built object's parameter colors), { texts } (what its signs say),
  // { base } (a structure's ground floor height, pushing the ground down under it), or several. Changes made between beginEdit and endEdit undo together; without, each is its own
  // edit.
  changeSelected(changes) {
    const { selected } = this;
    if (!selected) return;
    const own = !this.edit;
    if (own) this.beginEdit();
    this.touch(selected.key);
    const { object } = selected;
    if (changes.colors !== undefined) object.colors = changes.colors;
    if (changes.texts !== undefined) object.texts = changes.texts;
    if (object.texts && !Object.keys(object.texts).length) delete object.texts;
    if (changes.yaw !== undefined) object.yaw = ((changes.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const structure = specOf(object.type)?.structure;
    if (structure) {
      object.yaw = quartersOf(object.yaw) * (Math.PI / 2);
      if (changes.base !== undefined) object.base = Math.round(changes.base * 4) / 4;
      if (changes.yaw !== undefined || changes.base !== undefined) this.settle(object, structure);
    } else if (changes.scale !== undefined) {
      const spec = specOf(object.type);
      const [least, most] = spec.built ? spec.size : spec.size.map((v, i) => v * [0.5, 2][i]);
      object.scale = Math.round(Math.max(least, Math.min(most, changes.scale)) * 100) / 100;
      object.footprint = footprintOf(object.type, object.scale);
      object.height = Math.round(spec.height * object.scale * 100) / 100;
    }
    this.dirtyObjects.add(selected.key);
    this.drawSelection();
    if (own) this.endEdit();
    this.onSelect?.(object);
  }

  deleteSelected() {
    const { selected } = this;
    if (!selected) return;
    this.beginEdit();
    this.touch(selected.key);
    const structure = specOf(selected.object.type)?.structure;
    // Taken away, a structure puts back the ground it pushed down: no base is low enough to push.
    if (structure) this.settle({ ...selected.object, base: Infinity }, structure);
    const tile = this.view.decoded.get(selected.key);
    tile.objects = tile.objects.filter((o) => o !== selected.object);
    this.dirtyObjects.add(selected.key);
    this.endEdit();
    this.select(null);
  }

  // Pushes the ground down under a placed structure as far as its base needs, putting back what it
  // pushed before (pushGround), within the edit under way.
  settle(object, structure) {
    const { changes, pushed } = pushGround(structure, object, this.cells(), CELL_FT);
    object.pushed = pushed;
    this.setHeights(changes);
    // The ground's drawn again where a cellar opens up, to cut it away there.
    if ((structure.walk ?? bakeWalk(structure)).cut.length) {
      const [tx, tz] = tileOf(object.at);
      const near = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) near.push(`${tx + dx},${tz + dz}`);
      this.changed(near);
    }
  }

  // The height of the highest ground under a structure's ground floor, rounded up to a foot.
  highestUnder(object, structure) {
    const tileAt = (tx, tz) => this.view.decoded.get(`${tx},${tz}`);
    const half = STRUCTURE_CELL_FT / 2;
    const heights = placedWalk(structure, { at: object.at, yaw: quartersOf(object.yaw), base: 0 })
      .cells.filter((c) => c.level === 0)
      .map(({ cell: [x, z] }) => meshHeightAt(tileAt, x * STRUCTURE_CELL_FT + half, z * STRUCTURE_CELL_FT + half) ?? -Infinity);
    const top = Math.max(...heights);
    return Number.isFinite(top) ? Math.ceil(top) : Math.ceil(meshHeightAt(tileAt, ...object.at) ?? 0);
  }

  // A ring round the selected object's footprint; round a structure, a box round its cells.
  drawSelection() {
    this.selectionRing ??= new THREE.Group();
    this.view.scene.add(this.selectionRing);
    for (const child of [...this.selectionRing.children]) {
      child.geometry.dispose();
      child.material.dispose();
      this.selectionRing.remove(child);
    }
    if (!this.selected) return;
    const { object } = this.selected;
    const structure = specOf(object.type)?.structure;
    if (structure) {
      const cells = placedWalk(structure, { at: object.at, yaw: quartersOf(object.yaw), base: 0 }).cells.map((c) => c.cell);
      const [x0, z0] = [0, 1].map((a) => Math.min(...cells.map((c) => c[a])) * STRUCTURE_CELL_FT - 1);
      const [x1, z1] = [0, 1].map((a) => (Math.max(...cells.map((c) => c[a])) + 1) * STRUCTURE_CELL_FT + 1);
      const line = boundary([[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => [x / TILE_FT, z / TILE_FT]), this.view.ground, this.view.origin, CURSOR.selected);
      line.material.depthTest = false;
      line.renderOrder = 4;
      this.selectionRing.add(line);
      return;
    }
    const r = reachOf(object) + 1;
    const points = Array.from({ length: CURSOR.points }, (_, n) => {
      const a = (n / CURSOR.points) * Math.PI * 2;
      return [(object.at[0] + Math.cos(a) * r) / TILE_FT, (object.at[1] + Math.sin(a) * r) / TILE_FT];
    });
    const line = boundary(points, this.view.ground, this.view.origin, CURSOR.selected);
    line.material.depthTest = false;
    line.renderOrder = 4;
    this.selectionRing.add(line);
  }

  // Makes the objects of tiles whose ground hasn't changed again.
  rebuildObjects() {
    const { view } = this;
    // A structure changing moves what stands in it, in the tiles around too.
    for (const key of [...this.dirtyObjects]) {
      if (!view.decoded.get(key)?.objects?.some((o) => specOf(o.type)?.structure)) continue;
      const [tx, tz] = key.split(",").map(Number);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (view.decoded.has(`${tx + dx},${tz + dz}`)) this.dirtyObjects.add(`${tx + dx},${tz + dz}`);
    }
    for (const key of this.dirtyObjects) {
      if (this.dirty.has(key)) continue;
      const [tx, tz] = key.split(",").map(Number);
      for (const child of [...view.objects.children]) {
        const at = child.userData.tile;
        if (!at || at[0] !== tx || at[1] !== tz) continue;
        view.objects.remove(child);
        child.dispose();
      }
      view.addObjects(view.decoded.get(key));
    }
    this.dirtyObjects.clear();
  }

  // Makes the changed tiles' meshes again.
  rebuild() {
    const { view } = this;
    for (const key of this.dirty) {
      view.dropTile(key);
      view.buildGround(key);
      view.addTrees(view.decoded.get(key));
      view.addObjects(view.decoded.get(key));
    }
    this.dirty.clear();
  }

  // Where a pointer event meets the ground, [x, z] in continent feet, or null.
  pointAt(e) {
    const hit = this.groundAt(e);
    return hit && [hit.x + this.view.origin[0], hit.z + this.view.origin[1]];
  }

  // Where a pointer event meets the window's ground, in scene feet, or null.
  groundAt(e) {
    if (!this.window) return null;
    const r = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.view.camera);
    const ground = this.view.content.children.filter((child) => child.userData.ground);
    return ray.intersectObjects(ground, false)[0]?.point ?? null;
  }

  // Rings round the brush where it works fully and where its falloff ends; for the trail tool, a
  // ring as wide as the trail, and the trail drawn so far.
  drawCursor(hit) {
    for (const child of [...this.cursor.children]) {
      child.geometry.dispose();
      child.material.dispose();
      this.cursor.remove(child);
    }
    if (!this.brush) return;
    const { origin, ground } = this.view;
    const add = (points, color, closed = true) => {
      const line = boundary(points.map(([x, z]) => [x / TILE_FT, z / TILE_FT]), ground, origin, color, closed);
      line.material.depthTest = false;
      line.renderOrder = 4;
      this.cursor.add(line);
    };
    if (this.trail?.length >= 2) add(this.trail, this.brush.tool === "channel" ? CURSOR.channel : CURSOR.trail, false);
    if (!hit) return;
    const ring = (radius) =>
      Array.from({ length: CURSOR.points }, (_, n) => {
        const a = (n / CURSOR.points) * Math.PI * 2;
        return [hit.x + origin[0] + Math.cos(a) * radius, hit.z + origin[1] + Math.sin(a) * radius];
      });
    if (this.brush.tool === "paint") return add(ring(Math.max(CELL_FT / 2, this.brush.radius)), CURSOR.trail);
    if (["objects", "structures", "water"].includes(this.brush.tool)) return;
    const rings = DRAWN.has(this.brush.tool) ? [[Math.max(CELL_FT / 2, this.brush.width / 2), CURSOR.trail]] : [[this.brush.radius, CURSOR.inner], [this.brush.radius + this.brush.falloff, CURSOR.outer]];
    for (const [r, color] of rings) if (r > 0) add(ring(r), color);
  }

  // The window's tiles, as "tx,tz" keys.
  keys() {
    const { tx0, tz0, size } = this.window;
    const keys = [];
    for (let tz = tz0; tz < tz0 + size; tz++) for (let tx = tx0; tx < tx0 + size; tx++) keys.push(`${tx},${tz}`);
    return keys;
  }

  // The window's edge on the ground, and an arrow off each side.
  drawFrame() {
    const { view } = this;
    const { tx0, tz0, size } = this.window;
    for (const child of [...view.marks.children]) {
      child.geometry.dispose();
      child.material.dispose();
      view.marks.remove(child);
    }
    const corners = [[tx0, tz0], [tx0 + size, tz0], [tx0 + size, tz0 + size], [tx0, tz0 + size]];
    view.marks.add(boundary(corners, view.ground, view.origin, ARROW.color));

    for (const child of [...this.arrows.children]) {
      child.geometry.dispose();
      this.arrows.remove(child);
    }
    this.arrowMaterial ??= new THREE.MeshBasicMaterial({ color: ARROW.color, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.9 });
    const half = (size * TILE_FT) / 2;
    // Bigger for bigger windows, which are seen from further off.
    const scale = size / 3;
    for (const [side, [dx, dz]] of Object.entries(SIDES)) {
      const shape = new THREE.Shape();
      shape.moveTo(0, ARROW.lengthFt);
      shape.lineTo(-ARROW.widthFt / 2, 0);
      shape.lineTo(ARROW.widthFt / 2, 0);
      shape.closePath();
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.arrowMaterial);
      // Flat on the ground, pointing out of the window.
      const out = ARROW.outFt * scale;
      const [x, z] = [dx * (half + out), dz * (half + out)];
      mesh.rotation.set(-Math.PI / 2, 0, Math.atan2(-dx, -dz));
      mesh.position.set(x, Math.max(0, view.ground(x - dx * out, z - dz * out) || 0) + 8, z);
      mesh.scale.setScalar(scale);
      mesh.renderOrder = 3;
      mesh.userData.side = side;
      this.arrows.add(mesh);
    }
  }

  // The side whose arrow is under a pointer event, or null.
  arrowAt(e) {
    if (!this.window) return null;
    const r = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.view.camera);
    return ray.intersectObjects(this.arrows.children)[0]?.object.userData.side ?? null;
  }

  // Draws every frame while shown, so water moves and the sky turns.
  start() {
    this.shown = true;
    if (this.frame) return;
    const loop = () => {
      if (!this.shown) {
        this.frame = null;
        return;
      }
      const now = performance.now();
      if (this.stroke) this.work(now);
      if (this.dirtyObjects.size) this.rebuildObjects();
      if (this.dirty.size) {
        this.rebuild();
        if (this.pointer) this.hover(this.groundAt(this.pointer));
      } else if (this.trail) this.drawCursor(this.pointer && this.groundAt(this.pointer));
      this.view.render();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  hide() {
    this.release(true);
    this.shown = false;
  }
}

// A tile's changeable state, copied, for undoing.
function snapshot(tile) {
  return {
    layers: Object.fromEntries(Object.entries(tile.layers).map(([name, values]) => [name, values.slice()])),
    palettes: structuredClone(tile.palettes),
    objects: structuredClone(tile.objects ?? []),
    roads: structuredClone(tile.roads ?? []),
    sources: structuredClone(tile.sources ?? []),
  };
}

function restore(tile, state) {
  const copy = snapshot(state);
  Object.assign(tile, { layers: copy.layers, palettes: copy.palettes, objects: copy.objects, roads: copy.roads, sources: copy.sources });
}
