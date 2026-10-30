import { fbm } from "../world/noise.js";
import { CELL_FT, PLATE_FT, TILE_FT } from "../v2/sizes.js";

// Geo tools: the raise and lower brush. Dragged, it moves the ground a little each frame, most at
// the brush's middle, by its shape:
// - round eases out to nothing at the edge;
// - steep holds most of its height out to near the edge, then drops fast;
// - peak rises to a point, like the old editor's peak stamp.
// With noise on, it moves the ground in lumps about a third of the brush across, the same lumps
// at the same place each time. Its strength is how far the middle moves a second, as a share of
// the brush's radius, so big brushes work as fast across as small ones.

export const SHAPES = {
  round: (d) => 0.5 + 0.5 * Math.cos(Math.PI * d),
  steep: (d) => 1 - smoothstep(0.7, 0.95, d),
  peak: (d) => (1 - d) ** 1.8,
};
const NOISE_SEED = 0x51ed27a3;
const NOISE = 0.9; // how far the lumps go either way, as a share of the brush's move

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

// One frame of the brush at continent feet (x, z), dt seconds long: { at(x, z), the height it
// adds there, bounds [x0, z0, x1, z1] round where that's not 0, level }.
export function raiseBrush({ shape, radius, strength, noise, lower }, x, z, dt) {
  const move = (lower ? -1 : 1) * strength * radius * dt;
  const wavelength = Math.max(2 * CELL_FT, radius / 3);
  const at = (px, pz) => {
    const d = Math.hypot(px - x, pz - z) / radius;
    if (d >= 1) return 0;
    const lump = noise ? 1 + NOISE * fbm(px, pz, NOISE_SEED, { wavelength, octaves: 4 }) : 1;
    return move * SHAPES[shape](d) * lump;
  };
  return { at, bounds: [x - radius, z - radius, x + radius, z + radius], level: levelFor(radius) };
}
