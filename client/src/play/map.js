import { STEEP_STEPS } from "../v2/rendition.js";
import { roadTrack } from "../v2/roads.js";
import { CHUNK_FT, PLATTER_FT, PLATTER_TILES, SEA_LEVEL_FT, TILE_CHUNKS } from "../v2/sizes.js";
import { keyBindings } from "./keys.js";
import { continentGrid, landMask, outlines, solidMask } from "./mapShapes.js";

// The map, opened with its key (keys.js, M by default): the continent flat from above, from its
// platters' parts, 32 ft each, its shapes' edges smoothed (mapShapes.js). Ground you can't reach is
// drawn solid, with no line round it, since its edges are only roughly where you can go. Water is blue and roads are lines, with pins for your home and where new characters start, and an
// arrow for you.

const LAND = "#e9e2ce";
const SOLID = "#a8998a";
const WATER = "#8cb2ce";
const SHORE = "#6f93ae";
const ROAD = "#9a6a3a";
const CLICK_PX = 4; // a drag shorter than this is a click
const PICK_PX = 14; // how near an icon's middle the pointer picks it
const ICON_UP = 14; // how far over its spot an icon's middle is
const MIN_SCALE = 0.005; // pixels a foot
const MAX_SCALE = 1;
const START_SCALE = 0.125;

// The map unsmoothed, for /debug map pixels (debugCommand.js): a platter's image, RGBA, a pixel a
// part, water where it's wet, else land darkened by its steep share.
const SIDE = PLATTER_TILES * TILE_CHUNKS;
function rawImage({ tiles }) {
  const [land, steep, water] = [[233, 226, 206], [96, 86, 76], [140, 178, 206]];
  const out = new Uint8ClampedArray(SIDE * SIDE * 4);
  for (let k = 0; k < SIDE * SIDE; k++) out.set([...water, 255], k * 4);
  for (const [index, tile] of tiles) {
    const [ti, tj] = [index % PLATTER_TILES, Math.floor(index / PLATTER_TILES)];
    for (let part = 0; part < TILE_CHUNKS * TILE_CHUNKS; part++) {
      const share = tile.steep ? tile.steep[part] / STEEP_STEPS : 0;
      const rgb = tile.water && !Number.isNaN(tile.water.level[part]) ? water : land.map((v, c) => v + (steep[c] - v) * share);
      out.set([...rgb, 255], ((tj * TILE_CHUNKS + Math.floor(part / TILE_CHUNKS)) * SIDE + ti * TILE_CHUNKS + (part % TILE_CHUNKS)) * 4);
    }
  }
  return out;
}

// Closed loops of [x, z] as one path.
function path(loops) {
  const out = new Path2D();
  for (const loop of loops) {
    out.moveTo(loop[0], loop[1]);
    for (let k = 2; k < loop.length; k += 2) out.lineTo(loop[k], loop[k + 1]);
    out.closePath();
  }
  return out;
}

export class PlayMap {
  // platters(): the continent's platters, decoded. roads(): its roads.json, or null. at(): where
  // you are, { x, z, yaw }, or null. pins(): [{ label, x, z }]. With `key`, the map's key opens
  // and closes it; Escape always closes it, and onClose() hears. markers(): the continent's map
  // pins (v2/mapPins.js), drawn by type, their names shown as the pointer's over them.
  // onClick(x, z, marker): a click on the map that isn't a drag, and the marker it's on, or null.
  constructor({ platters, roads, at, pins, markers = () => [], onClick = null, key = true, onClose = () => {}, parent = document.body }) {
    Object.assign(this, { platters, roads, at, pins, markers, onClick, listens: key, onClose, shapes: null, open: false });
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 1000; cursor: grab";
    this.canvas.hidden = true;
    parent.append(this.canvas);
    this.center = [0, 0];
    this.scale = START_SCALE;
    window.addEventListener("keydown", (e) => this.key(e), { capture: true });
    window.addEventListener("resize", () => this.open && this.draw());
    this.canvas.addEventListener("wheel", (e) => this.zoom(e), { passive: false });
    this.canvas.addEventListener("pointerdown", (e) => this.drag(e));
    this.canvas.addEventListener("pointermove", (e) => (this.hover = [e.offsetX, e.offsetY]));
    this.canvas.addEventListener("pointerleave", () => (this.hover = null));
  }

  key(e) {
    if (keyBindings().recording || e.target.matches?.("input, textarea, select") || e.target.closest?.("form")) return;
    const closing = e.key === "Escape" && this.open;
    if (!closing && !(this.listens && keyBindings().actionFor(e)?.id === "map")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) this.toggle(!closing && !this.open);
  }

  // Draws it again from the platters when it next opens, for a world that's changed.
  refresh() {
    this.shapes = this.rawImages = null;
  }

  toggle(open) {
    if (open === this.open) return;
    this.open = open;
    this.canvas.hidden = !open;
    if (!open) return this.onClose();
    const at = this.at();
    if (at) this.center = [at.x, at.z];
    if (!this.shapes && !this.platters().length) this.shapes = { grid: null, land: new Path2D(), solid: new Path2D() };
    if (!this.shapes) {
      const grid = continentGrid(this.platters());
      // Reached from the sea, where you are, and the pins. Land a little in from the shore, so
      // streams a part wide stay open.
      const seeds = [...(at ? [[at.x, at.z]] : []), ...this.pins().map(({ x, z }) => [x, z])];
      this.shapes = { grid, land: path(outlines(landMask(grid), grid, { passes: 1, level: 0.7 })), solid: path(outlines(solidMask(grid, seeds), grid)) };
    }
    const frame = () => {
      if (!this.open) return;
      this.draw();
      requestAnimationFrame(frame);
    };
    frame();
  }

  // Zooms about the pointer.
  zoom(e) {
    e.preventDefault();
    const before = this.toWorld(e.offsetX, e.offsetY);
    this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * Math.exp(-e.deltaY * 0.002)));
    const after = this.toWorld(e.offsetX, e.offsetY);
    this.center = [this.center[0] + before[0] - after[0], this.center[1] + before[1] - after[1]];
  }

  drag(e) {
    this.canvas.setPointerCapture(e.pointerId);
    let [x, y] = [e.clientX, e.clientY];
    let moved = 0;
    const move = (m) => {
      this.center = [this.center[0] - (m.clientX - x) / this.scale, this.center[1] - (m.clientY - y) / this.scale];
      moved += Math.hypot(m.clientX - x, m.clientY - y);
      [x, y] = [m.clientX, m.clientY];
    };
    const up = (u) => {
      this.canvas.removeEventListener("pointermove", move);
      this.canvas.removeEventListener("pointerup", up);
      if (moved > CLICK_PX || !this.onClick) return;
      this.onClick(...this.toWorld(u.offsetX, u.offsetY), this.markerAt(u.offsetX, u.offsetY), [u.clientX, u.clientY]);
    };
    this.canvas.addEventListener("pointermove", move);
    this.canvas.addEventListener("pointerup", up);
  }

  // The marker whose icon's at screen (x, y), or null.
  markerAt(x, y) {
    let [best, bestD] = [null, PICK_PX];
    for (const marker of this.markers()) {
      const [sx, sy] = this.toScreen(...marker.at);
      const d = Math.hypot(sx - x, sy - ICON_UP - y);
      if (d < bestD) [best, bestD] = [marker, d];
    }
    return best;
  }

  toWorld(x, y) {
    return [this.center[0] + (x - this.canvas.width / 2) / this.scale, this.center[1] + (y - this.canvas.height / 2) / this.scale];
  }

  toScreen(x, z) {
    return [(x - this.center[0]) * this.scale + this.canvas.width / 2, (z - this.center[1]) * this.scale + this.canvas.height / 2];
  }

  draw() {
    const { canvas } = this;
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) [canvas.width, canvas.height] = [canvas.clientWidth, canvas.clientHeight];
    const g = canvas.getContext("2d");
    g.fillStyle = WATER;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.save();
    g.setTransform(this.scale, 0, 0, this.scale, canvas.width / 2 - this.center[0] * this.scale, canvas.height / 2 - this.center[1] * this.scale);
    if (this.raw) this.drawRaw(g);
    else this.drawShapes(g);
    g.restore();
    this.drawMarks(g);
  }

  drawRaw(g) {
    this.rawImages ??= this.platters().map((platter) => {
      const image = document.createElement("canvas");
      [image.width, image.height] = [SIDE, SIDE];
      image.getContext("2d").putImageData(new ImageData(rawImage(platter), SIDE, SIDE), 0, 0);
      return { coords: platter.coords, image };
    });
    g.imageSmoothingEnabled = true;
    for (const { coords, image } of this.rawImages) g.drawImage(image, coords[0] * PLATTER_FT, coords[1] * PLATTER_FT, PLATTER_FT, PLATTER_FT);
  }

  drawShapes(g) {
    g.lineJoin = "round";
    g.lineWidth = 1 / this.scale;
    g.fillStyle = LAND;
    g.fill(this.shapes.land, "evenodd");
    g.strokeStyle = SHORE;
    g.stroke(this.shapes.land);
    g.fillStyle = SOLID;
    g.fill(this.shapes.solid, "evenodd");
  }

  // Roads, pins and you, over either.
  drawMarks(g) {
    g.strokeStyle = ROAD;
    g.lineCap = g.lineJoin = "round";
    for (const { points, kind, seed } of this.roads()?.roads ?? []) {
      const track = roadTrack(points, kind, seed);
      g.lineWidth = Math.max(kind === "road" ? 2.5 : 1.5, (track.width[0] ?? 4) * this.scale);
      g.setLineDash(kind === "footpath" ? [4, 3] : []);
      g.beginPath();
      for (let k = 0; k < track.x.length; k++) g[k ? "lineTo" : "moveTo"](...this.toScreen(track.x[k], track.z[k]));
      g.stroke();
    }
    g.setLineDash([]);
    g.font = "13px sans-serif";
    g.textAlign = "center";
    for (const marker of this.markers()) (marker.type === "cave" ? this.cave : this.place).call(this, g, this.toScreen(...marker.at));
    for (const { label, x, z } of this.pins()) this.pin(g, label, this.toScreen(x, z));
    const you = this.at();
    if (you) this.arrow(g, this.toScreen(you.x, you.z), you.yaw);
    if (!this.hover) return;
    const over = this.markerAt(...this.hover);
    if (over) this.label(g, over.name, this.toScreen(...over.at));
    this.coordinates(g, this.toWorld(...this.hover));
  }

  // A place's pin: a teardrop with a hole, its point on the spot.
  place(g, [x, y]) {
    g.fillStyle = "#d9412f";
    g.strokeStyle = "#8f2117";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x, y - ICON_UP, 7, Math.PI * 0.8, Math.PI * 0.2);
    g.lineTo(x, y);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "#7a1a12";
    g.beginPath();
    g.arc(x, y - ICON_UP, 2.6, 0, Math.PI * 2);
    g.fill();
  }

  // A cave's: a mound of rock with a dark mouth, standing on the spot.
  cave(g, [x, y]) {
    g.fillStyle = "#8c8174";
    g.strokeStyle = "#4a423a";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x - 11, y);
    g.quadraticCurveTo(x - 9, y - 20, x, y - 21);
    g.quadraticCurveTo(x + 9, y - 20, x + 11, y);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "#1e1a17";
    g.beginPath();
    g.moveTo(x - 5, y);
    g.quadraticCurveTo(x - 5, y - 11, x, y - 11);
    g.quadraticCurveTo(x + 5, y - 11, x + 5, y);
    g.closePath();
    g.fill();
  }

  // A name over an icon.
  label(g, text, [x, y]) {
    g.font = "13px sans-serif";
    g.textAlign = "center";
    g.lineWidth = 3;
    g.strokeStyle = "#fff";
    g.strokeText(text, x, y - ICON_UP - 12);
    g.fillStyle = "#222";
    g.fillText(text, x, y - ICON_UP - 12);
  }

  // Where the pointer is, x, y and z, in the bottom left: y the ground's height there, or the
  // water's, as the map has it, a chunk at a time.
  coordinates(g, [x, z]) {
    const { grid } = this.shapes;
    if (!grid) return;
    const [i, j] = [Math.floor(x / CHUNK_FT) - grid.x0, Math.floor(z / CHUNK_FT) - grid.z0];
    const inside = i >= 0 && j >= 0 && i < grid.w && j < grid.h;
    const y = inside ? grid.top[j * grid.w + i] : SEA_LEVEL_FT;
    const text = [x, y, z].map(Math.round).join(", ");
    g.font = "14px sans-serif";
    g.textAlign = "left";
    g.lineWidth = 3;
    g.strokeStyle = "#fff";
    g.strokeText(text, 12, this.canvas.height - 14);
    g.fillStyle = "#222";
    g.fillText(text, 12, this.canvas.height - 14);
  }

  pin(g, label, [x, y]) {
    g.fillStyle = "#b8322a";
    g.strokeStyle = "#fff";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y - 14, 6, 0, Math.PI * 2);
    g.moveTo(x - 4, y - 10);
    g.lineTo(x, y);
    g.lineTo(x + 4, y - 10);
    g.stroke();
    g.fill();
    g.lineWidth = 3;
    g.strokeText(label, x, y - 24);
    g.fillStyle = "#222";
    g.fillText(label, x, y - 24);
  }

  // You, pointing the way you face: yaw 0 faces south, down the map.
  arrow(g, [x, y], yaw) {
    const [fx, fy] = [Math.sin(yaw), Math.cos(yaw)];
    const point = (along, across) => [x + fx * along - fy * across, y + fy * along + fx * across];
    g.fillStyle = "#1d5fd0";
    g.strokeStyle = "#fff";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(...point(11, 0));
    g.lineTo(...point(-7, 7));
    g.lineTo(...point(-3, 0));
    g.lineTo(...point(-7, -7));
    g.closePath();
    g.stroke();
    g.fill();
  }
}
