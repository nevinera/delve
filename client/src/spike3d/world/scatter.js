import { CELL_FT, TERRAIN } from "./constants.js";
import { hash3 } from "./noise.js";

export const HUT = {width: 16, depth: 12, height: 15};
const HUT_CLEAR_FT = 18;

// Where every prop goes, derived from the tags alone. Each cell hashes its
// own coordinates, so editing one cell never reshuffles another's trees.
// Returns {kinds: {pine: [...], ...}, blockers: [...]}: instances are
// {x, y, z, rot, scale, tint}, blockers are what nav treats as solid.
export function scatterProps(world) {
  const kinds = {pine: [], oak: [], willow: [], deadTree: [], rock: [], reed: [], lily: [], hut: []};
  const blockers = [];
  const water = world.waterLevel;

  for (const o of world.objects) {
    if (o.type !== "hut") continue;
    const y = hutFloor(world, o);
    kinds.hut.push({x: o.x, y, z: o.z, rot: o.rot, scale: 1, tint: 0.9 + hash3(o.x | 0, o.z | 0, 3) * 0.2});
    blockers.push({shape: "rect", x: o.x, z: o.z, rot: o.rot, hw: HUT.width / 2, hd: HUT.depth / 2, top: y + HUT.height});
  }
  const nearHut = (x, z) => world.objects.some((o) => Math.hypot(o.x - x, o.z - z) < HUT_CLEAR_FT);

  for (let gz = 0; gz < world.h; gz++) {
    for (let gx = 0; gx < world.w; gx++) {
      const i = gz * world.w + gx;
      const terrain = world.terrain[i];
      const cx = (gx + 0.5) * CELL_FT;
      const cz = (gz + 0.5) * CELL_FT;
      const swamp = world.swamp[i];
      const depth = water - world.height[i];
      const rnd = (k) => hash3(gx, gz, k);
      const jitter = (k) => ({x: cx + (rnd(k) - 0.5) * CELL_FT * 0.9, z: cz + (rnd(k + 1) - 0.5) * CELL_FT * 0.9});
      const place = (kind, p, scale, sink = 0, y = null) => {
        const item = {
          x: p.x, z: p.z, y: y ?? world.heightAt(p.x, p.z) - sink,
          rot: rnd(40) * Math.PI * 2, scale, tint: 0.82 + rnd(41) * 0.3,
        };
        kinds[kind].push(item);
        return item;
      };
      if (terrain === TERRAIN.road) continue;

      const forest = world.forest[i] / 255;
      if (forest > 0 && rnd(1) < forest * 0.55) {
        const p = jitter(2);
        const okDepth = depth < 0.3 || (swamp > 0.5 && depth < 2.2);
        if (okDepth && world.slopeAt(p.x, p.z, 2) < 0.7 && !nearHut(p.x, p.z)) {
          const scale = 0.75 + rnd(5) * 0.6;
          let kind;
          if (rnd(6) < swamp) kind = rnd(7) < 0.6 ? "willow" : "deadTree";
          else kind = rnd(7) < 0.35 + world.height[i] / 120 ? "pine" : "oak";
          place(kind, p, scale, 0.4);
          blockers.push({shape: "circle", x: p.x, z: p.z, r: (kind === "willow" ? 1.6 : 1.1) * scale});
        }
      }

      if ((terrain === TERRAIN.rock && rnd(10) < 0.22) || (depth < 0 && rnd(10) < 0.006)) {
        const p = jitter(11);
        if (!nearHut(p.x, p.z)) {
          const scale = 0.6 + rnd(12) * 1.1;
          place("rock", p, scale, 0.6 * scale);
          blockers.push({shape: "circle", x: p.x, z: p.z, r: 2.4 * scale});
        }
      }

      const reedOdds = swamp > 0.3 ? 0.3 * swamp : 0.1;
      if (Math.abs(depth) < (swamp > 0.3 ? 2 : 1.0) && rnd(20) < reedOdds) {
        place("reed", jitter(21), 0.8 + rnd(22) * 0.7, 0.2);
      }
      if (swamp > 0.3 && depth > 0.6 && depth < 5 && rnd(30) < 0.4 * swamp) {
        place("lily", jitter(31), 0.6 + rnd(32) * 0.8, 0, water + 0.06);
      }
    }
  }
  return {kinds, blockers};
}

// Huts sit on the highest ground under their footprint; their stone
// foundation hides the rest.
export function hutFloor(world, o) {
  let top = -Infinity;
  for (const [u, v] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const lx = (u * HUT.width) / 2;
    const lz = (v * HUT.depth) / 2;
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    top = Math.max(top, world.heightAt(o.x + lx * c + lz * s, o.z - lx * s + lz * c));
  }
  return top;
}
