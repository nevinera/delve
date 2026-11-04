// The stock particle effects abilities pick by name, and what their parameters come to. Each key
// here is a parameter an ability's visual can set over the stock value (.agents/formats.md):
// - count: how many it lets go at once. rate and duration: how many a second it lets go, for how long.
// - lifetime: seconds each lasts. speed: feet a second each starts at.
// - direction and spread: which way they go, up or forward, and how many degrees across. 360 is every way.
// - gravity: feet a second a second downward, or upward below 0. drag: how fast they slow, 0 for not at all.
// - size and sizeEnd: feet across at the start and the end. radius: how far round its point it lets them go.
// - texture: the shape of each. blend: glow adds light, solid covers what's behind.
// - stretch: how much they draw out along the way they're going. spin: turns a second. opacity: 0 to 1.
// - at: where on a unit they start, feet or chest. facing: camera, or ground to lie flat.

export const PARTICLE_TEXTURES = ["dot", "spark", "star", "smoke", "ring", "shard", "flame", "noise"];
export const PARTICLE_NUMBERS = ["count", "rate", "duration", "lifetime", "speed", "spread", "gravity", "drag", "size", "sizeEnd", "radius", "stretch", "spin", "opacity"];

const BASE = { count: 0, rate: 0, duration: 0, lifetime: 1, speed: 0, direction: "up", spread: 360, gravity: 0, drag: 0, size: 0.5, sizeEnd: 0.5, radius: 0, texture: "dot", blend: "glow", stretch: 0, spin: 0, opacity: 1, at: "chest", facing: "camera" };

export const PARTICLE_STOCK = {
  sparks: { ...BASE, count: 45, lifetime: 0.55, speed: 24, gravity: 45, drag: 1.5, size: 0.7, sizeEnd: 0.2, texture: "spark", stretch: 1.5 },
  embers: { ...BASE, rate: 30, duration: 1.2, lifetime: 1.3, speed: 2.5, spread: 50, gravity: -5, size: 0.8, sizeEnd: 0.2, radius: 1.2 },
  smoke: { ...BASE, rate: 16, duration: 1.2, lifetime: 2, speed: 2.5, spread: 40, gravity: -2.5, drag: 0.5, size: 2.2, sizeEnd: 7, radius: 1, texture: "smoke", blend: "solid", spin: 0.15, opacity: 0.45, at: "feet" },
  motes: { ...BASE, rate: 22, duration: 1.5, lifetime: 1.3, speed: 1, gravity: -2.5, size: 1, sizeEnd: 0.25, radius: 3, texture: "star", spin: 0.5, at: "feet" },
  flare: { ...BASE, count: 2, lifetime: 0.28, size: 2.5, sizeEnd: 8, opacity: 0.8 },
  shards: { ...BASE, count: 22, lifetime: 0.7, speed: 20, gravity: 50, drag: 0.6, size: 1, sizeEnd: 0.4, texture: "shard", blend: "solid", spin: 2.5 },
  flames: { ...BASE, rate: 40, duration: 1.2, lifetime: 0.6, speed: 7, spread: 25, gravity: -8, size: 2.4, sizeEnd: 0.5, radius: 0.9, texture: "flame", opacity: 0.45, at: "feet" },
  shockwave: { ...BASE, count: 1, lifetime: 0.45, size: 1, sizeEnd: 18, texture: "ring", opacity: 0.8, at: "feet", facing: "ground" },
};
export const PARTICLE_EFFECTS = Object.keys(PARTICLE_STOCK);

export const isParticleEffect = (name) => Object.hasOwn(PARTICLE_STOCK, name);

// A visual's particle effect with its parameters laid over the stock one's, and its scale taken
// into its sizes, speeds and reach, so a bigger one keeps its shape.
export function particleSpec(name, params = {}) {
  const spec = { ...PARTICLE_STOCK[name] };
  for (const key of Object.keys(spec)) if (params[key] !== undefined && params[key] !== null) spec[key] = params[key];
  const scale = params.scale ?? 1;
  for (const key of ["speed", "gravity", "size", "sizeEnd", "radius"]) spec[key] *= scale;
  return spec;
}

// How long an effect keeps letting particles go, in seconds.
export const emitsFor = (spec) => (spec.rate > 0 ? spec.duration : 0);

// How far along an emitting effect has let go how many: all of `count` at the start, then rate.
export function dueBy(spec, u) {
  return spec.count + Math.floor(spec.rate * spec.duration * Math.min(1, u));
}

// A unit vector for one particle: `spread` degrees across around `way`. rand gives 0 to 1.
export function aimed(way, spread, rand = Math.random) {
  const reach = (Math.min(360, spread) / 2) * (Math.PI / 180);
  const cos = 1 - rand() * (1 - Math.cos(reach));
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  const turn = rand() * Math.PI * 2;
  // Two directions square to `way`.
  const [wx, wy, wz] = way;
  const [ax, ay, az] = Math.abs(wy) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const [ux, uy, uz] = normal([ay * wz - az * wy, az * wx - ax * wz, ax * wy - ay * wx]);
  const [vx, vy, vz] = [wy * uz - wz * uy, wz * ux - wx * uz, wx * uy - wy * ux];
  const [c, s] = [Math.cos(turn) * sin, Math.sin(turn) * sin];
  return [wx * cos + ux * c + vx * s, wy * cos + uy * c + vy * s, wz * cos + uz * c + vz * s];
}

function normal([x, y, z]) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

// The grayscale sheet's cells, each a function of (x, y), -1 to 1 across the cell, to 0 to 1.
const fall = (d, from = 1) => Math.max(0, Math.min(1, (from - d) / from));
const smooth = (v) => v * v * (3 - 2 * v);
const lump = (x, y) => {
  // A few overlaid waves, so smoke and flame aren't round.
  const wave = Math.sin(x * 5.1 + 1.3) * Math.cos(y * 4.3 - 0.7) + 0.5 * Math.sin(x * 9.7 - y * 8.1 + 2.1) + 0.25 * Math.cos(x * 17.3 + y * 15.9);
  return 0.5 + wave * 0.3;
};
export const TEXTURE_CELLS = {
  dot: (x, y) => smooth(fall(Math.hypot(x, y))) ** 1.5,
  spark: (x, y) => smooth(fall(Math.hypot(x * 1, y * 6))) + 0.7 * smooth(fall(Math.hypot(x * 3, y * 3))),
  star: (x, y) => Math.max(smooth(fall(Math.hypot(x * 1.1, y * 12))), smooth(fall(Math.hypot(x * 12, y * 1.1))), smooth(fall(Math.hypot(x, y), 0.45))),
  smoke: (x, y) => smooth(fall(Math.hypot(x, y) / 0.95)) * Math.max(0, Math.min(1, lump(x, y) * 1.3)),
  ring: (x, y) => smooth(fall(Math.abs(Math.hypot(x, y) - 0.8) / 0.16)),
  shard: (x, y) => (Math.abs(x) * 2.2 + Math.abs(y) * 1.1 < 0.95 ? 0.75 + 0.25 * Math.sign(x + y * 0.3) : 0),
  flame: (x, y) => smooth(fall(Math.hypot(x * (1.6 - y * 0.9), y) / 0.95)) * Math.min(1, 0.55 + lump(x * 0.8, y * 0.5)),
  noise: (x, y) => smooth(fall(Math.hypot(x, y))) * lump(x * 2.3, y * 2.3),
};
export const SHEET = { columns: 4, rows: 2, cellPx: 64 };

// The sheet as bytes, a byte a texel, with the first cell's rows first.
export function sheetBytes({ columns, rows, cellPx } = SHEET) {
  const bytes = new Uint8Array(columns * rows * cellPx * cellPx);
  PARTICLE_TEXTURES.forEach((name, n) => {
    const cell = TEXTURE_CELLS[name];
    const [cx, cy] = [n % columns, Math.floor(n / columns)];
    for (let j = 0; j < cellPx; j++) {
      for (let i = 0; i < cellPx; i++) {
        const [x, y] = [((i + 0.5) / cellPx) * 2 - 1, ((j + 0.5) / cellPx) * 2 - 1];
        // Fades out at the edge so cells don't bleed into each other.
        const edge = Math.min(1, (1 - Math.max(Math.abs(x), Math.abs(y))) * 8);
        bytes[(cy * cellPx + j) * columns * cellPx + cx * cellPx + i] = Math.round(255 * Math.min(1, cell(x, y)) * edge);
      }
    }
  });
  return bytes;
}
