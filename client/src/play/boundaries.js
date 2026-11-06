import * as THREE from "three";
import { PLATE_FT, SEA_LEVEL_FT, TILE_FT } from "../v2/sizes.js";

// Lines laid over the ground round you, for seeing where things end:
// - tile: the edges of the tiles near you
// - plate: the edges of the plates near you
// - clutter: how far off clutter's drawn, and the tiles it's made from
// Each follows the ground, a little over it, and is made again as you move.

export const BOUNDARIES = ["tile", "plate", "clutter"];
const LIFT_FT = 1.5; // over the ground, as heights between its corners are read coarser than drawn
const STEP_FT = 8; // how far apart a line's points are
const COLORS = { tile: 0xffe14d, plate: 0xff5a4d, clutter: 0x4de1ff };
const AGAIN_FT = 8; // the clutter line's made again when you've moved this far
const AGAIN_MS = 2000; // and every line this often, to follow ground read in since

export class Boundaries {
  // heightAt(x, z) is the ground's height there, or null where it isn't read yet. clutter is what
  // draws the clutter: its radiusFt, and the tiles it's made from.
  constructor(scene, heightAt, clutter) {
    Object.assign(this, { heightAt, clutter });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.shown = new Map(); // kind -> { lines, at }, at being what they were made for
  }

  show(kind) {
    if (!this.shown.has(kind)) this.shown.set(kind, { lines: null, at: null, made: 0 });
  }

  hide(kind) {
    const was = this.shown.get(kind);
    if (was?.lines) this.drop(was.lines);
    this.shown.delete(kind);
  }

  // Each frame, with you at (x, z).
  tick(x, z, now = performance.now()) {
    for (const [kind, kept] of this.shown) {
      const at = this.madeFor(kind, x, z, kept.at);
      if (at === kept.at && now - kept.made < AGAIN_MS) continue;
      kept.made = now;
      if (kept.lines) this.drop(kept.lines);
      kept.lines = this.make(kind, x, z);
      kept.at = at;
      this.group.add(kept.lines);
    }
  }

  // What the kind's lines depend on, as a string, or `was` when that's not changed.
  madeFor(kind, x, z, was) {
    const tile = `${Math.floor(x / TILE_FT)},${Math.floor(z / TILE_FT)}`;
    if (kind === "tile") return tile === was ? was : tile;
    if (kind === "plate") {
      const plate = `${Math.floor(x / PLATE_FT)},${Math.floor(z / PLATE_FT)}`;
      return plate === was ? was : plate;
    }
    const [wx, wz, ...rest] = (was ?? "").split(",");
    const now = `${this.clutter.radiusFt},${this.clutter.tiles}`;
    const same = was && Math.hypot(x - wx, z - wz) < AGAIN_FT && rest.join(",") === now;
    return same ? was : `${x},${z},${now}`;
  }

  make(kind, x, z) {
    const points = [];
    if (kind === "tile") this.grid(points, x, z, TILE_FT, 3);
    if (kind === "plate") this.grid(points, x, z, PLATE_FT, 1);
    if (kind === "clutter") {
      const { radiusFt, tiles } = this.clutter;
      const steps = Math.ceil((2 * Math.PI * radiusFt) / STEP_FT);
      const ring = Array.from({ length: steps + 1 }, (_, k) => [x + radiusFt * Math.cos((k / steps) * 2 * Math.PI), z + radiusFt * Math.sin((k / steps) * 2 * Math.PI)]);
      this.drape(points, ring);
      // The square of tiles clutter's made from.
      const [x0, z0, x1, z1] = tiles ? tiles.map((t, k) => (t + (k > 1 ? 1 : 0)) * TILE_FT) : [x, z, x, z];
      if (tiles) for (const side of [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]]) this.drape(points, this.along(...side));
    }
    const geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: COLORS[kind], fog: false }));
    lines.frustumCulled = false;
    lines.renderOrder = 10;
    return lines;
  }

  // The edges of the `size` squares within `around` of the one you're in.
  grid(points, x, z, size, around) {
    const [ax, az] = [Math.floor(x / size), Math.floor(z / size)];
    const [lo, hi] = [-around, around + 1];
    for (let k = lo; k <= hi; k++) {
      this.drape(points, this.along([(ax + k) * size, (az + lo) * size], [(ax + k) * size, (az + hi) * size]));
      this.drape(points, this.along([(ax + lo) * size, (az + k) * size], [(ax + hi) * size, (az + k) * size]));
    }
  }

  // Points from a to b, STEP_FT apart.
  along([ax, az], [bx, bz]) {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP_FT));
    return Array.from({ length: steps + 1 }, (_, k) => [ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps]);
  }

  // A line through the points, on the ground, as segments.
  drape(points, line) {
    const y = ([px, pz]) => (this.heightAt(px, pz) ?? SEA_LEVEL_FT) + LIFT_FT;
    for (let k = 1; k < line.length; k++) points.push(line[k - 1][0], y(line[k - 1]), line[k - 1][1], line[k][0], y(line[k]), line[k][1]);
  }

  drop(lines) {
    this.group.remove(lines);
    lines.geometry.dispose();
    lines.material.dispose();
  }
}
