import { fbm } from "../world/noise.js";
import { CELL_FT, PLATE_FT, TILE_FT } from "../v2/sizes.js";

// Geo tools: the raise and lower, flatten, smooth and noise brushes. Dragged, it moves the ground a little each frame, most at
// the brush's middle, by its shape:
// - round eases out to nothing at the edge;
// - steep holds most of its height out to near the edge, then drops fast;
// - peak rises to a point, like the old editor's peak stamp;
// - cylinder moves everything inside the edge the same, a hard edge;
// - mesa is flat out to three quarters of the way, drops nearly straight down, then eases out flat;
// - half is round cut in half, a cliff along the cut, turned by the brush's angle.
// With noise, it moves the ground in lumps about a third of the brush across, the same lumps at
// the same place each time, going up to `noise` times the brush's move either way. Its strength is how far the middle moves a second, as a share of
// the brush's radius, so big brushes work as fast across as small ones.

// Each shape's height at d, the distance from the middle as a share of the radius, and u, how far
// along the brush's angle that is, from -1 to 1.
const round = (d) => 0.5 + 0.5 * Math.cos(Math.PI * d);
export const SHAPES = {
  round,
  steep: (d) => 1 - smoothstep(0.7, 0.95, d),
  peak: (d) => (1 - d) ** 1.8,
  cylinder: () => 1,
  mesa: (d) => (d < 0.8 ? 1 - 0.8 * smoothstep(0.75, 0.8, d) : 0.2 * ((1 - d) / 0.2) ** 2),
  half: (d, u) => (u >= 0 ? round(d) : 0),
};
// Shapes that look different turned.
export const TURNS = new Set(["half"]);
const NOISE_SEED = 0x51ed27a3;

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// How finely a brush of `radius` ft works: on cell corners, chunk corners or tile corners,
// whichever puts at least about 16 across it.
export const CELLS = 0;
export const CHUNKS = 1;
export const TILES = 2;
export const levelFor = (radius) => (radius < TILE_FT ? CELLS : radius < PLATE_FT ? CHUNKS : TILES);
const STEPS = { [CELLS]: CELL_FT, [CHUNKS]: CELL_FT * 8, [TILES]: CELL_FT * 64 };

// One frame of the brush at continent feet (x, z), dt seconds long, turned `angle` radians from
// east toward south: { at(x, z), the height it adds there, bounds [x0, z0, x1, z1] round where
// that's not 0, level }.
export function raiseBrush({ shape, radius, strength, noise, lower, angle = 0 }, x, z, dt) {
  const move = (lower ? -1 : 1) * strength * radius * dt;
  const wavelength = Math.max(2 * CELL_FT, radius / 3);
  const at = (px, pz) => {
    const d = Math.hypot(px - x, pz - z) / radius;
    if (d >= 1) return 0;
    const lump = noise > 0 ? 1 + noise * fbm(px, pz, NOISE_SEED, { wavelength, octaves: 4 }) : 1;
    const u = ((px - x) * Math.cos(angle) + (pz - z) * Math.sin(angle)) / radius;
    return move * SHAPES[shape](d, u) * lump;
  };
  return { at, bounds: [x - radius, z - radius, x + radius, z + radius], level: levelFor(radius) };
}

// The noise brush roughens the ground a little each frame, most at the brush's middle, easing to
// nothing at its edge: lumps `grain` ft across, rounded or craggy, the same lumps at the same place
// each time, so going over it again makes them taller, and the other way takes them out again.
// Its strength is how far the lumps grow a second, as a share of their size, so fine grain makes
// small lumps and coarse grain big ones. Brushes reaching further than CELLS_FT, or with coarse
// grain, work on chunk corners, or tile corners, to keep it quick, and their grain's at least
// GRAIN_STEPS of those.
const GRAIN_SEED = 0x2b7c94e1;
const CELLS_FT = 512;
const GRAIN_STEPS = 3;

export function noiseBrush({ radius, strength, grain, craggy, lower }, x, z, dt) {
  const level = levelFor(Math.max(grain, (radius * TILE_FT) / CELLS_FT));
  grain = Math.max(grain, GRAIN_STEPS * STEPS[level]);
  const move = (lower ? -1 : 1) * strength * grain * dt;
  const at = (px, pz) => {
    const d = Math.hypot(px - x, pz - z) / radius;
    if (d >= 1) return 0;
    const n = fbm(px, pz, GRAIN_SEED, { wavelength: grain, octaves: 4 });
    // Ridged: sharp crests where the noise crosses 0, about level on average.
    return move * round(d) * (craggy ? 2 * (0.7 - Math.abs(n)) : n);
  };
  return { at, bounds: [x - radius, z - radius, x + radius, z + radius], level };
}

// Flatten and smooth pull the ground toward a height a little each frame, most at the brush's
// middle, easing to nothing at its edge: flatten toward `from`, the height where the stroke began,
// and smooth toward the average of the ground round each point, about an eighth of the brush away
// each way, in whole steps of the brush's level. `strength` sets how fast: at the middle, flatten goes FLATTEN_RATE × strength of the way
// a second, and smooth SMOOTH_RATE × strength.
const FLATTEN_RATE = 5;
const SMOOTH_RATE = 15;

// One frame of flatten or smooth (`tool`) at (x, z), dt seconds long, heightAt(x, z) giving the
// ground's height: like raiseBrush's. Each point's move is worked out once a frame, so points
// shared by neighbouring tiles move alike.
export function pullBrush(tool, { radius, strength }, x, z, dt, heightAt, from) {
  const level = levelFor(radius);
  const step = Math.max(1, Math.round(radius / 8 / STEPS[level])) * STEPS[level];
  const rate = (tool === "flatten" ? FLATTEN_RATE : SMOOTH_RATE) * strength * dt;
  const moves = new Map();
  const at = (px, pz) => {
    const d = Math.hypot(px - x, pz - z) / radius;
    if (d >= 1) return 0;
    const key = `${px},${pz}`;
    if (moves.has(key)) return moves.get(key);
    const h = heightAt(px, pz);
    const to = tool === "flatten" ? from : (heightAt(px + step, pz) + heightAt(px - step, pz) + heightAt(px, pz + step) + heightAt(px, pz - step)) / 4;
    const move = (to - h) * Math.min(1, rate * SHAPES.round(d));
    moves.set(key, move);
    return move;
  };
  return { at, bounds: [x - radius, z - radius, x + radius, z + radius], level };
}
