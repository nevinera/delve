import { decodePlatter } from "../v2/platter.js";
import { keyBindings } from "./keys.js";
import { STEEP_STEPS } from "../v2/rendition.js";
import { roadTrack } from "../v2/roads.js";
import { PLATTER_FT, PLATTER_TILES, TILE_CHUNKS } from "../v2/sizes.js";

// The map, opened with its key (keys.js, M by default): the continent flat from above, from its platters, a pixel a chunk.
// Ground too steep to climb is darker by how much of it is, water is blue and roads are lines,
// with pins for your home and where new characters start, and an arrow for you.

const SIDE = PLATTER_TILES * TILE_CHUNKS; // a platter's image, pixels a side
const LAND = [233, 226, 206];
const STEEP = [96, 86, 76];
const WATER = [140, 178, 206];
const SEA = WATER; // past the tiles, the same, so the coast's edge doesn't show
const ROAD = "#9a6a3a";
const MIN_SCALE = 0.005; // pixels a foot
const MAX_SCALE = 1;
const START_SCALE = 0.125;

// A platter's image, RGBA SIDE×SIDE, a pixel a tile's part: water where it's wet, else land darkened
// by its steep share.
export function platterImage({ tiles }) {
  const out = new Uint8ClampedArray(SIDE * SIDE * 4);
  for (let k = 0; k < SIDE * SIDE; k++) out.set([...SEA, 255], k * 4);
  for (const [index, { water, steep }] of tiles) {
    const [ti, tj] = [index % PLATTER_TILES, Math.floor(index / PLATTER_TILES)];
    for (let b = 0; b < TILE_CHUNKS; b++) {
      for (let a = 0; a < TILE_CHUNKS; a++) {
        const part = b * TILE_CHUNKS + a;
        const share = steep ? steep[part] / STEEP_STEPS : 0;
        const rgb = water && !Number.isNaN(water.level[part]) ? WATER : LAND.map((v, c) => v + (STEEP[c] - v) * share);
        out.set([...rgb, 255], ((tj * TILE_CHUNKS + b) * SIDE + ti * TILE_CHUNKS + a) * 4);
      }
    }
  }
  return out;
}

export class PlayMap {
  // platters: [[px, pz], bytes]. roads: the continent's roads.json. at(): where you are, { x, z,
  // yaw }, or null. pins(): [{ label, x, z }].
  constructor({ platters, roads, at, pins, parent = document.body }) {
    Object.assign(this, { platters, roads: roads?.roads ?? [], at, pins, images: null, open: false });
    this.canvas = document.createElement("canvas");
    this.canvas.className = "play-map";
    this.canvas.hidden = true;
    parent.append(this.canvas);
    this.center = [0, 0];
    this.scale = START_SCALE;
    window.addEventListener("keydown", (e) => this.key(e), { capture: true });
    window.addEventListener("resize", () => this.open && this.draw());
    this.canvas.addEventListener("wheel", (e) => this.zoom(e), { passive: false });
    this.canvas.addEventListener("pointerdown", (e) => this.drag(e));
  }

  key(e) {
    if (keyBindings().recording || e.target.matches?.("input, textarea, select")) return;
    const closing = e.key === "Escape" && this.open;
    if (!closing && keyBindings().actionFor(e)?.id !== "map") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) this.toggle(!closing && !this.open);
  }

  toggle(open) {
    this.open = open;
    this.canvas.hidden = !open;
    if (!open) return;
    const at = this.at();
    if (at) this.center = [at.x, at.z];
    this.images ??= this.platters.map(([coords, bytes]) => {
      const canvas = document.createElement("canvas");
      [canvas.width, canvas.height] = [SIDE, SIDE];
      canvas.getContext("2d").putImageData(new ImageData(platterImage(decodePlatter(bytes)), SIDE, SIDE), 0, 0);
      return { coords, canvas };
    });
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
    const move = (m) => {
      this.center = [this.center[0] - (m.clientX - x) / this.scale, this.center[1] - (m.clientY - y) / this.scale];
      [x, y] = [m.clientX, m.clientY];
    };
    const up = () => {
      this.canvas.removeEventListener("pointermove", move);
      this.canvas.removeEventListener("pointerup", up);
    };
    this.canvas.addEventListener("pointermove", move);
    this.canvas.addEventListener("pointerup", up);
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
    g.fillStyle = `rgb(${SEA.join(",")})`;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.imageSmoothingEnabled = true;
    for (const { coords, canvas: image } of this.images) {
      const [x, y] = this.toScreen(coords[0] * PLATTER_FT, coords[1] * PLATTER_FT);
      g.drawImage(image, x, y, PLATTER_FT * this.scale, PLATTER_FT * this.scale);
    }
    g.strokeStyle = ROAD;
    g.lineCap = g.lineJoin = "round";
    for (const { points, kind, seed } of this.roads) {
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
    for (const { label, x, z } of this.pins()) this.pin(g, label, this.toScreen(x, z));
    const you = this.at();
    if (you) this.arrow(g, this.toScreen(you.x, you.z), you.yaw);
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
