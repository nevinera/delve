// Cliffs drawn on the heights step: lines the ground steps down across, to the right of the way
// each was drawn (with x east and z south, the right of east is south). How far it steps down is
// left to the height pins: heightField.js works out each cliff's drop along its length, so the
// pins either side can be far apart in height while the ground between them stays gentle.
//
// The step is a double layer along the line: a field that's smooth everywhere but on the line,
// and jumps down by the drop crossing it. Away from the line it fades, half the drop up on the
// top side and half down on the bottom side, so the smooth surface through the pins takes up the
// rest. The drop is set at knots every `knotFt` or so along the line, at least `minDropFt`, and
// varies straight between them. It eases to nothing over the last `taperFt` of each end, so a
// cliff fades into a slope there.
//
// On the bottom side the jump is spread into a jagged face `faceFt` across: its top edge ragged,
// split by splinters that run down it, with a few shallow ledges here and there.
//
// Points are feet in continent space.

import { fbm } from "./noise.js";
import { makePolyline, nearBounds, nearest } from "./polyline.js";

export const CLIFF = { minDropFt: 8, knotFt: 300, taperFt: 150 };
// The face: as wide as `faceFt` (varying along the cliff over `widthWavelength`), its top edge
// wandering by `raggedFt`, splinters pushing it in or out by up to `splinter` of its width, and
// bumps up to `bumpsFt` high (or `bumpShare` of the drop, if less). Ledges cover about `ledges`
// of a cliff, each `ledgeFt` wide, between `ledgeLevel` of the way down.
const FACE = {
  faceFt: [20, 50],
  widthWavelength: 220,
  raggedFt: 6,
  raggedWavelength: 40,
  splinter: 0.3,
  splinterWavelength: 12,
  bumpsFt: 3,
  bumpShare: 0.15,
  ledges: 0.3,
  ledgeWavelength: 160,
  ledgeFt: [4, 9],
  ledgeLevel: [0.3, 0.7],
  ledgeSlope: 0.1,
};
// Where the ground's kept gentle either side of a cliff, in ft to its right.
const ACROSS_FT = [-500, -250, -100, 100, 250, 500];
const REACH_FT = FACE.faceFt[1] * (1 + FACE.splinter) + FACE.raggedFt;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// cliffs: [{ points: [[x, z], ...] }] in ft. Returns { knots, basis, across, settle }, or null
// with no cliffs: knots is [{ cliff, along }], one per drop to work out, `cliff` its index in
// cliffs; basis(x, z) is how much
// each knot's drop moves the ground at a point, per foot; across lists spots either side of each
// knot, with the way across the cliff there ([x, z, dx, dz]), where the ground should be gentle;
// settle(drops) gives heightAt(x, z), what the cliffs add to the ground with those drops.
export function prepareCliffs(cliffs, seed) {
  const knots = [];
  const across = [];
  const lines = [];
  const pieces = [];
  for (const [index, cliff] of cliffs.entries()) {
    const line = makePolyline(cliff.points);
    if (!line.segments.length) continue;
    const length = line.length;
    const taper = Math.min(CLIFF.taperFt, length / 4);
    const n = Math.max(1, Math.ceil((length - 2 * taper) / CLIFF.knotFt));
    // Where the drop is set along the line, and by which knot (-1 for none, at the ends).
    const stops = [{ along: 0, knot: -1 }];
    for (let k = 0; k <= n; k++) {
      const along = taper + ((length - 2 * taper) * k) / n;
      stops.push({ along, knot: knots.length });
      knots.push({ cliff: index, along });
      const seg = line.segments.findLast((s) => s.start <= along) ?? line.segments[0];
      const [x, z] = [seg.ax + seg.dx * (along - seg.start), seg.az + seg.dz * (along - seg.start)];
      for (const off of ACROSS_FT) across.push([x - seg.dz * off, z + seg.dx * off, -seg.dz, seg.dx]);
    }
    stops.push({ along: length, knot: -1 });
    const entry = { line, stops, seed: seed ^ Math.imul(index + 1, 0x9e3779b1) };
    lines.push(entry);

    // Straight pieces between every corner and stop, each with the drop at its two ends as
    // shares of the knots'.
    const breaks = [...new Set([...line.segments.map((s) => s.start), ...stops.map((s) => s.along), length])].sort((a, b) => a - b);
    for (let i = 1; i < breaks.length; i++) {
      const [s0, s1] = [breaks[i - 1], breaks[i]];
      if (s1 - s0 < 1e-6) continue;
      const seg = line.segments.findLast((s) => s.start <= (s0 + s1) / 2) ?? line.segments[0];
      const [ax, az] = [seg.ax + seg.dx * (s0 - seg.start), seg.az + seg.dz * (s0 - seg.start)];
      pieces.push({ ax, az, dx: seg.dx, dz: seg.dz, len: s1 - s0, a: sharesAt(stops, s0), b: sharesAt(stops, s1) });
    }
  }
  if (!knots.length) return null;

  const basis = (x, z) => {
    const out = new Float64Array(knots.length);
    for (const p of pieces) {
      const [ca, cb] = pieceTerms(p, x, z);
      for (const [k, w] of p.a) out[k] += ca * w;
      for (const [k, w] of p.b) out[k] += cb * w;
    }
    return out;
  };

  const settle = (drops) => {
    const dropAt = (shares) => shares.reduce((sum, [k, w]) => sum + drops[k] * w, 0);
    const fixed = pieces.map((p) => ({ p, a: dropAt(p.a), b: dropAt(p.b) }));
    return (x, z) => {
      let h = 0;
      for (const { p, a, b } of fixed) {
        const [ca, cb] = pieceTerms(p, x, z);
        h += ca * a + cb * b;
      }
      for (const entry of lines) h += face(entry, drops, x, z);
      return h;
    };
  };

  return { knots, basis, across, settle };
}

// The knots a drop at `along` comes from, as [[knot, share]].
function sharesAt(stops, along) {
  let i = 0;
  while (i < stops.length - 2 && stops[i + 1].along < along) i++;
  const [s, t] = [stops[i], stops[i + 1]];
  const f = t.along > s.along ? clamp((along - s.along) / (t.along - s.along), 0, 1) : 0;
  return [
    [s.knot, 1 - f],
    [t.knot, f],
  ].filter(([k, w]) => k >= 0 && w > 0);
}

// How much a piece's drops at its start and end move the ground at (x, z), per foot of each.
// The piece runs `len` along (dx, dz) from (ax, az), its drop varying straight between the two;
// the field is minus the drop integrated over the angle the piece covers seen from (x, z), over
// 2π, which comes out in closed form. u is how far along the piece the point is, w how far to its
// right (the bottom side). A point right on the line counts as on top, as it does for the face.
function pieceTerms(p, x, z) {
  const [rx, rz] = [x - p.ax, z - p.az];
  const u = rx * p.dx + rz * p.dz;
  const w = rz * p.dx - rx * p.dz || -1e-9;
  const angle = Math.atan2(-w, p.len - u) - Math.atan2(-w, -u);
  const spread = (w / (2 * p.len)) * Math.log(((p.len - u) ** 2 + w * w) / (u * u + w * w));
  const a = (1 - u / p.len) * angle - spread;
  const b = (u / p.len) * angle + spread;
  return [-a / (2 * Math.PI), -b / (2 * Math.PI)];
}

// The drop at `along` a cliff.
function dropAlong(entry, drops, along) {
  return sharesAt(entry.stops, along).reduce((sum, [k, w]) => sum + drops[k] * w, 0);
}

// The face on the bottom side: the ground climbs back up to the top over its width, which the
// field's jump left at the line. Zero away from it.
function face(entry, drops, x, z) {
  if (!nearBounds(entry.line, x, z, REACH_FT)) return 0;
  const near = nearest(entry.line, x, z);
  if (near.dist > REACH_FT) return 0;
  const drop = dropAlong(entry, drops, near.along);
  if (drop <= 0) return 0;
  const below = near.side < 0 ? near.dist : -near.dist; // ft down the face from its top edge
  // Noise along the cliff, the same all the way down the face, so splinters run down it.
  const along = (n, wavelength, octaves = 2, across = 0) => fbm(near.along, across, entry.seed ^ n, { wavelength, octaves });
  const width = lerp(...FACE.faceFt, clamp(along(0x51ed270b, FACE.widthWavelength) + 0.5, 0, 1));
  const ragged = along(0x2f8bd4e1, FACE.raggedWavelength) * 2 * FACE.raggedFt;
  const splinter = along(0x1b56c4e9, FACE.splinterWavelength, 2, below * 0.15) * 2 * FACE.splinter * width;
  const t = clamp((below + ragged + splinter) / width, 0, 1);

  // A ledge where there is one: the face levels off a little partway down.
  let fall = t;
  const ledge = smoothstep(1 - FACE.ledges, 1 - FACE.ledges + 0.08, along(0x68e31da4, FACE.ledgeWavelength) + 0.5);
  if (ledge > 0) {
    const share = (lerp(...FACE.ledgeFt, clamp(along(0x3c6ef372, 90) + 0.5, 0, 1)) / width) * ledge;
    const level = lerp(...FACE.ledgeLevel, clamp(along(0x7f4a7c15, 400) + 0.5, 0, 1));
    const start = level * (1 - share);
    const flat = (1 - FACE.ledgeSlope) * clamp(t - start, 0, share);
    fall = (t - flat) / (1 - (1 - FACE.ledgeSlope) * share);
  }
  const bumps = t > 0 && t < 1 ? fbm(x, z, entry.seed ^ 0x45d9f3b, { wavelength: 9, octaves: 2 }) * Math.min(FACE.bumpsFt, drop * FACE.bumpShare) * 4 * t * (1 - t) : 0;
  return drop * ((below > 0 ? 1 : 0) - fall) + bumps;
}
