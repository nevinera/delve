import { CLUTTER, colorIn } from "../world/clutter.js";
import { hash2 } from "../world/noise.js";
import { TILE_FT } from "../v2/sizes.js";

// Clutter round cave mouths, as world/clutter.js's kinds: pebbles, stones and twigs on the ground
// outside and the floor just in, rock jutting from the hill face and the mouth's walls and roof,
// and in forest and swamp, vines. It's worked out from the mesh the tile's caves are drawn with
// (caveMesh.js), never stored, so it's the same every time it's drawn. Each face of the mesh is
// ground or hill face (the ground the caves draw round a mouth, flat or steep), or floor, wall or
// ceiling (the rock, by the way it faces), and each rule puts `per` of a kind on each 100 sq ft of
// one of those at the lip, fewer further off, none past `reach` ft, in `biomes` where it says.
// Vines go one of VINES ways for each entrance, by a hash of it: loops along its roof, or strands
// down one side, or over one corner, all from the upper part of the mouth ("upper": its walls and
// roof over halfway up).

const RULES = [
  { kind: "pebble", on: "ground", per: 12, reach: 10 },
  { kind: "stone", on: "ground", per: 3, reach: 8 },
  { kind: "twig", on: "ground", per: 3, reach: 10, biomes: ["forest", "swamp"] },
  { kind: "litter", on: "ground", per: 1.5, reach: 8, biomes: ["forest"] },
  { kind: "crag", on: "face", per: 8, reach: 8 },
  { kind: "pebble", on: "floor", per: 14, reach: 14 },
  { kind: "stone", on: "floor", per: 4, reach: 12 },
  { kind: "twig", on: "floor", per: 2, reach: 8, biomes: ["forest", "swamp"] },
  { kind: "crag", on: "wall", per: 8, reach: 6 },
  { kind: "crag", on: "ceiling", per: 1.5, reach: 4 },
  { kind: "vineLoop", on: "upper", per: 10, reach: 5, biomes: ["forest", "swamp"], vines: "loops" },
  { kind: "vine", on: "upper", per: 16, reach: 5, biomes: ["forest", "swamp"], vines: "side" },
  { kind: "vine", on: "upper", per: 24, reach: 4, biomes: ["forest", "swamp"], vines: "corner" },
];
const VINES = ["loops", "side", "corner"];
const HANGS = new Set(["vineLoop", "vine"]); // kinds that hang straight down, whichever way their face looks
const SEED = 0x6d6f7574;
const DOWN = [0, -1, 0];

// Tile (tx, tz)'s clutter round mouths, [{ kind, x, z, y, yaw, scale, normal, colors }], from
// `mesh`, caveMesh's for the tile, `entrances`, the cave layout's (caveLayout.js), and biomeAt(x, z),
// the biome's name there.
export function mouthClutter(tx, tz, mesh, { entrances, biomeAt }) {
  const lips = mesh.lips;
  if (!lips?.length) return [];
  const [ox, oz] = [tx * TILE_FT, tz * TILE_FT];
  // How far continent feet p is from the nearest of the lip.
  const fromLip = (p) => {
    let best = Infinity;
    for (let n = 0; n < lips.length; n += 3) best = Math.min(best, (lips[n] - p[0]) ** 2 + (lips[n + 1] - p[1]) ** 2 + (lips[n + 2] - p[2]) ** 2);
    return Math.sqrt(best);
  };
  const reach = Math.max(...RULES.map((rule) => rule.reach));
  const [lo, hi] = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (let n = 0; n < lips.length; n += 3) for (let m = 0; m < 3; m++) [lo[m], hi[m]] = [Math.min(lo[m], lips[n + m] - reach), Math.max(hi[m], lips[n + m] + reach)];
  // The entrance nearest p, with which way its vines go, and its right, along the ground.
  const nearest = (p) => {
    let best = null;
    for (const e of entrances) {
      const d = Math.hypot(e.mouth[0] - p[0], e.mouth[2] - p[2]);
      if (!best || d < best.d) best = { e, d };
    }
    if (!best) return null;
    const { e } = best;
    const a = (e.yaw * Math.PI) / 180;
    const hash = [...e.id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193), 0x811c9dc5);
    return { e, vines: VINES[(hash >>> 0) % VINES.length], side: hash & 0x10000 ? 1 : -1, right: [Math.cos(a), -Math.sin(a)] };
  };
  const out = [];
  const place = (positions, indices, surface) => {
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => [positions[indices[t + k] * 3] + ox, positions[indices[t + k] * 3 + 1], positions[indices[t + k] * 3 + 2] + oz]);
      const middle = [0, 1, 2].map((m) => (a[m] + b[m] + c[m]) / 3);
      if (middle.some((v, m) => v < lo[m] || v > hi[m])) continue;
      const u = b.map((v, m) => v - a[m]);
      const v = c.map((w, m) => w - a[m]);
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const area = Math.hypot(...cross) / 2;
      if (!area) continue;
      const normal = cross.map((n) => n / (2 * area));
      const near = fromLip(middle);
      if (near > reach) continue;
      const on = surface(normal);
      const entrance = nearest(middle);
      const biome = biomeAt(middle[0], middle[2]);
      const [qi, qj] = [Math.round(middle[0] * 8), Math.round(middle[2] * 8) ^ Math.round(middle[1] * 8 * 4099)];
      RULES.forEach((rule, r) => {
        if (near > rule.reach || (rule.biomes && !rule.biomes.includes(biome))) return;
        if (rule.vines && !vinesHere(rule, entrance, middle, normal)) return;
        if (rule.on !== on && !(rule.on === "upper" && (on === "wall" || on === "ceiling"))) return;
        const per = (rule.per * area * (1 - near / rule.reach)) / 100;
        const roll = (m, q) => hash2(qi, qj, SEED ^ Math.imul(r * 1024 + m * 32 + q + 1, 0x2545f491));
        const count = Math.floor(per) + (roll(0, 0) < per % 1 ? 1 : 0);
        const spec = CLUTTER[rule.kind];
        for (let m = 0; m < count; m++) {
          // A point on the face, evenly.
          let [s, w] = [roll(m, 1), roll(m, 2)];
          if (s + w > 1) [s, w] = [1 - s, 1 - w];
          const at = a.map((p, k) => p + u[k] * s + v[k] * w);
          out.push({
            kind: rule.kind,
            x: at[0],
            y: at[1],
            z: at[2],
            yaw: roll(m, 3) * Math.PI * 2,
            scale: spec.size[0] + (spec.size[1] - spec.size[0]) * roll(m, 4),
            normal: HANGS.has(rule.kind) ? DOWN : normal,
            colors: spec.parts.map((part, p) => (part.chance !== undefined && roll(m, 5 + p * 4) >= part.chance ? null : colorIn(part.colors, (q) => roll(m, 6 + p * 4 + q)))),
          });
        }
      });
    }
  };
  if (mesh.ground) place(mesh.ground.positions, mesh.ground.indices, (n) => (n[1] > 0.75 ? "ground" : "face"));
  place(mesh.positions, mesh.indices, (n) => (n[1] > 0.6 ? "floor" : n[1] < -0.5 ? "ceiling" : "wall"));
  return out;
}

// Whether vines by `rule` grow on the face at `middle`, facing `normal`, as its nearest entrance's
// go, from the mouth's upper part: loops along it, or strands down one side, or over its corner.
function vinesHere(rule, entrance, middle, normal) {
  if (!entrance || entrance.vines !== rule.vines) return false;
  const { e, right, side } = entrance;
  // Its upper part: over halfway up the tube, which is as tall as it's wide.
  const up = (middle[1] - e.mouth[1]) / e.width;
  if (up < 0.5 || normal[1] > 0.2) return false;
  if (rule.vines === "loops") return true;
  const across = ((middle[0] - e.mouth[0]) * right[0] + (middle[2] - e.mouth[2]) * right[1]) / (e.width / 2);
  return rule.vines === "side" ? across * side > 0.3 : across * side > 0.4 && up > 0.6;
}
