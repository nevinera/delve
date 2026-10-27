import { LAND_FT } from "../world/landGrid.js";
import { fbm } from "../world/noise.js";

// The heights step's sculpting tools, worked on a land grid (world/landGrid.js). Each returns the
// changes it makes, [[gx, gz, h], ...], for the view to apply, keep for undoing and redraw.
//
// Brushes are dragged, and work a little each frame, most at the brush's middle and easing to
// nothing at its edge:
// - raise and lower move the ground by up to `strength` ft a second;
// - smooth pulls each point toward its neighbours' average;
// - flatten pulls toward the height where the stroke began, and set toward a typed height;
// - noise raises and lowers in a pattern of lumps about half the brush across;
// - terrace pulls toward the nearest step of `terrace` ft.
// The pulling brushes go about strength / PULL_PER of the way each second.
//
// Stamps press a shape into the ground, as wide as the brush and `height` ft tall: added to it,
// raised to it where it's higher (max), or cut down to it where it's lower (min), measured from the
// ground at its middle. A ramp evens the ground out along a line between two points, as wide as the
// brush, from one's height to the other's.

export const BRUSHES = ["raise", "lower", "smooth", "flatten", "set", "noise", "terrace"];
export const TOOLS = [...BRUSHES, "stamp", "ramp"];
const SMOOTH_RATE = 6; // of the way to the neighbours' average, per second at the brush's middle
const PULL_PER = 30; // strength per unit of pull a second
const NOISE_SEED = 0x2c1b3c6d;
const RAMP_CORE = 0.6; // of the ramp's half-width that's held right to it, before easing off

// A shape's height at d (0 at the middle, 1 at the edge), from 0 to 1.
export const SHAPES = {
  peak: (d) => (1 - d) ** 1.8,
  hill: (d) => 0.5 + 0.5 * Math.cos(Math.PI * d),
  mesa: (d) => 1 - smoothstep(0.55, 0.85, d),
  // A bowl sunk below the ground, inside a raised rim.
  crater: (d) => 0.45 * Math.exp(-(((d - 0.72) / 0.12) ** 2)) - 0.8 * (1 - smoothstep(0.1, 0.7, d)),
};
export const BLENDS = ["add", "max", "min"];

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// The points within `radius` ft of (x, z), each with its weight, 1 at the middle easing to 0.
function* within(x, z, radius) {
  const reach = Math.ceil(radius / LAND_FT);
  const [cx, cz] = [Math.round(x / LAND_FT), Math.round(z / LAND_FT)];
  for (let gz = cz - reach; gz <= cz + reach; gz++) {
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      const d = Math.hypot(gx * LAND_FT - x, gz * LAND_FT - z) / radius;
      if (d < 1) yield [gx, gz, d];
    }
  }
}

const ease = (d) => 0.5 + 0.5 * Math.cos(Math.PI * d);

// One frame of a brush at (x, z), dt seconds long. `from` is the height where the stroke began,
// for flatten.
export function brush(grid, { tool, radius, strength, target, terrace }, [x, z], dt, from) {
  const changes = [];
  const pull = (h, to, w) => h + (to - h) * Math.min(1, (strength / PULL_PER) * dt * w);
  for (const [gx, gz, d] of within(x, z, radius)) {
    const w = ease(d);
    const h = grid.point(gx, gz);
    let next = h;
    if (tool === "raise") next = h + strength * dt * w;
    else if (tool === "lower") next = h - strength * dt * w;
    else if (tool === "smooth") {
      let sum = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) sum += grid.point(gx + dx, gz + dz);
      next = h + (sum / 4 - h) * Math.min(1, SMOOTH_RATE * dt * w);
    } else if (tool === "flatten") next = pull(h, from, w);
    else if (tool === "set") next = pull(h, target, w);
    else if (tool === "terrace") next = pull(h, Math.round(h / terrace) * terrace, w);
    else if (tool === "noise") next = h + fbm(gx * LAND_FT, gz * LAND_FT, NOISE_SEED, { wavelength: Math.max(LAND_FT * 2, radius / 2), octaves: 3 }) * 2 * strength * dt * w;
    if (next !== h) changes.push([gx, gz, next]);
  }
  return changes;
}

// A stamp at (x, z), measured from the ground there.
export function stamp(grid, { shape, blend, height, radius }, [x, z]) {
  const base = grid.heightAt(x, z);
  const changes = [];
  for (const [gx, gz, d] of within(x, z, radius)) {
    const h = grid.point(gx, gz);
    const lift = SHAPES[shape](d) * height;
    let next = h + lift;
    if (blend === "max") next = Math.max(h, base + lift);
    else if (blend === "min") next = Math.min(h, base - lift);
    if (next !== h) changes.push([gx, gz, next]);
  }
  return changes;
}

// A ramp from a to b ([x, h, z] in ft), `radius` ft either side of the line between them.
export function ramp(grid, a, b, radius) {
  const [ax, ah, az] = a;
  const [bx, bh, bz] = b;
  const length = Math.hypot(bx - ax, bz - az);
  if (length < LAND_FT) return [];
  const [dx, dz] = [(bx - ax) / length, (bz - az) / length];
  const changes = [];
  const [x0, z0] = [Math.floor((Math.min(ax, bx) - radius) / LAND_FT), Math.floor((Math.min(az, bz) - radius) / LAND_FT)];
  const [x1, z1] = [Math.ceil((Math.max(ax, bx) + radius) / LAND_FT), Math.ceil((Math.max(az, bz) + radius) / LAND_FT)];
  for (let gz = z0; gz <= z1; gz++) {
    for (let gx = x0; gx <= x1; gx++) {
      const [rx, rz] = [gx * LAND_FT - ax, gz * LAND_FT - az];
      const along = rx * dx + rz * dz;
      const t = Math.max(0, Math.min(1, along / length));
      // How far off the line, counting past its ends too.
      const off = Math.hypot(rx - dx * t * length, rz - dz * t * length) / radius;
      if (off >= 1) continue;
      const w = off < RAMP_CORE ? 1 : ease((off - RAMP_CORE) / (1 - RAMP_CORE));
      const h = grid.point(gx, gz);
      const next = h + (ah + (bh - ah) * t - h) * w;
      if (next !== h) changes.push([gx, gz, next]);
    }
  }
  return changes;
}
