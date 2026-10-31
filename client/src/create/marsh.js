import { CELL_FT } from "../v2/sizes.js";

// Geo's pools tool: small pools scattered in the ground inside its ring, for swamps and marshes.
// Each is dug a foot or few into the ground, an uneven round hollow easing out to the ground at its
// edge, and filled with a swamp body of water (water.js) standing a little under the lowest ground
// round it. Pools keep off steep ground, water and each other.

const TRIES = 6; // how many places are tried for each pool
const APART = 0.3; // how far apart pools keep, as a share of their sizes, at least CELL_FT
const STEEPEST = 0.27; // how steep the ground under a pool may be, rise over run
const UNDER_FT = 0.3; // how far under the lowest ground round it a pool stands
const OUTLINE_POINTS = 20;
const OUTLINE_OUT = 1.15; // how far out its body's outline goes, as a share of its hollow
const RIM_POINTS = 16;

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// How deep a pool `r` ft across its middle is dug: shallow when small, at most 3 ft.
const depthOf = (r, roll) => Math.min(3, 0.6 + 0.12 * r) * (0.8 + 0.4 * roll);

// Up to `count` pools of about `size` ft across, scattered within `radius` ft of (x, z) on ground
// heightAt(x, z), off ground wetAt(x, z) says is wet, rand() rolling 0 to 1: [{ at(x, z), how far
// it moves the ground there, undo(x, z), the same negated, bounds [x0, z0, x1, z1], body: { level,
// points } }, ...]. Their moves are worked out on CELL_FT squares before any ground moves.
export function scatterPools({ radius, count, size }, x, z, heightAt, wetAt, rand = Math.random) {
  const pools = [];
  for (let tries = 0; tries < count * TRIES && pools.length < count; tries++) {
    const r = (size / 2) * (0.5 + rand());
    const [a, d] = [rand() * Math.PI * 2, Math.sqrt(rand()) * Math.max(0, radius - r)];
    const [cx, cz] = [x + Math.cos(a) * d, z + Math.sin(a) * d];
    if (pools.some((p) => Math.hypot(p.x - cx, p.z - cz) < (p.r + r) * (1 + APART) + CELL_FT)) continue;
    // Its edge, out from its middle at each angle: round, but uneven.
    const waves = [1, 2, 3].map((n) => [rand() * Math.PI * 2, (0.18 / n) * rand()]);
    const edge = (angle) => r * (1 + waves.reduce((sum, [phase, size], n) => sum + size * Math.sin((n + 1) * angle + phase), 0));
    const round = (out, points = RIM_POINTS) =>
      Array.from({ length: points }, (_, k) => {
        const angle = (k / points) * Math.PI * 2;
        return [cx + Math.cos(angle) * edge(angle) * out, cz + Math.sin(angle) * edge(angle) * out];
      });
    const rim = round(1).map(([px, pz]) => heightAt(px, pz));
    const around = round(1.2);
    if ([[cx, cz], ...around].some(([px, pz]) => wetAt(px, pz))) continue;
    const heights = around.map(([px, pz]) => heightAt(px, pz));
    if ((Math.max(...heights) - Math.min(...heights)) / (2.4 * r) > STEEPEST) continue;
    const low = Math.min(...rim);
    const depth = depthOf(r, rand());
    pools.push({ x: cx, z: cz, r, edge, low, depth, outline: round(OUTLINE_OUT, OUTLINE_POINTS) });
  }
  return pools.map((pool) => dig(pool, heightAt));
}

// A pool's moves on a grid of CELL_FT squares round it, and its body.
function dig({ x, z, r, edge, low, depth, outline }, heightAt) {
  const reach = r * 1.5 + CELL_FT;
  const [ox, oz] = [Math.floor((x - reach) / CELL_FT) * CELL_FT, Math.floor((z - reach) / CELL_FT) * CELL_FT];
  const n = Math.ceil((2 * reach) / CELL_FT) + 2;
  const grid = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [px, pz] = [ox + i * CELL_FT, oz + j * CELL_FT];
      const t = Math.hypot(px - x, pz - z) / edge(Math.atan2(pz - z, px - x));
      if (t >= 1) continue;
      // Down to `depth` under the lowest ground round it at its middle, easing out to the ground.
      const ground = heightAt(px, pz);
      const pit = low - depth * (1 - t * t);
      const b = smoothstep(0.55, 1, t);
      grid[j * n + i] = Math.min(0, pit * (1 - b) + ground * b - ground);
    }
  }
  const lookup = (sign) => (px, pz) => {
    const [u, v] = [(px - ox) / CELL_FT, (pz - oz) / CELL_FT];
    if (u < 0 || v < 0 || u > n - 1 || v > n - 1) return 0;
    const [i, j] = [Math.min(n - 2, Math.floor(u)), Math.min(n - 2, Math.floor(v))];
    const [fu, fv] = [u - i, v - j];
    const g = (a, b) => grid[(j + b) * n + i + a];
    return sign * ((g(0, 0) * (1 - fu) + g(1, 0) * fu) * (1 - fv) + (g(0, 1) * (1 - fu) + g(1, 1) * fu) * fv);
  };
  const tenth = (v) => Math.round(v * 10) / 10;
  return {
    at: lookup(1),
    undo: lookup(-1),
    bounds: [ox, oz, ox + (n - 1) * CELL_FT, oz + (n - 1) * CELL_FT],
    body: { level: tenth(low - UNDER_FT), points: outline.map(([px, pz]) => [tenth(px), tenth(pz)]) },
  };
}
