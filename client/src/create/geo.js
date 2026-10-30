import { fbm } from "../world/noise.js";
import { CELL_FT, PLATE_FT, TILE_FT } from "../v2/sizes.js";

// Geo tools: the raise and lower brush. Dragged, it moves the ground a little each frame, most at
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
