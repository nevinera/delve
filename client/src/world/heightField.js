// The broad shape of the land: a thin-plate spline through every height pin, the smoothest surface
// that passes through them all, like a sheet of metal bent through each pin. A spline overshoots
// past a steep pair of pins, so it's kept between a low and a high bound made from the pins in
// each neighbourhood: it can't dip much below the lowest pin around, or rise above the highest.
// Far from every pin it eases to a default height.
//
// Cliffs (cliffs.js) step the ground down along lines, by drops worked out here: the ones that
// leave the ground through the pins least steep beside them, so the cliffs take up the height
// between pins either side of them. A drop is never less than nothing.
//
// Points are feet in continent space. Solving happens once per continent; each point is then a sum
// over the pins.

import { CLIFF } from "./cliffs.js";

const UNIT = 1000; // the spline works in thousands of feet, to keep the solve well conditioned
const FAR = { start: 3000, end: 8000 }; // ft from the nearest pin over which it eases to the default
// The bounds: a soft min and max of the pins' heights, weighted 1 / (r² + reach²)², so a pin counts
// over about `reachFt` around it. `softFt` is how soft the min and max are, `slackFt` how far past
// them the spline may go, and `edgeFt` how gently it bends onto a bound.
const BOUND = { reachFt: 1000, softFt: 15, slackFt: 10, edgeFt: 8 };

// How strongly drops are held near nothing, and to their neighbours', where the pins don't settle
// them, as shares of how strongly the pins do.
const DROP_HOLD = { none: 1e-3, even: 0.1 };
const SLOPE_PROBE_FT = 1; // how far either way the cliffs' field's slope is measured over

const phi = (r) => (r > 0 ? r * r * Math.log(r) : 0);

// pins: [{ x, z, height }]; cliffs: from prepareCliffs, or null. Returns heightAt(x, z), with
// heightAt.smooth(x, z), the ground without the cliffs, and when there are cliffs,
// heightAt.step(x, z), what they add to it, and heightAt.drops, each cliff knot's drop ({ values,
// short }, `short` saying which are under CLIFF.shortFt).
export function prepareHeights(pins, defaultHeight, cliffs = null) {
  const m = cliffs?.knots.length ?? 0;
  if (!pins.length) {
    const flat = () => defaultHeight;
    if (!m) return Object.assign(flat, { smooth: flat });
    return Object.assign(flat, { smooth: flat, drops: { values: new Float64Array(m), short: new Uint8Array(m).fill(1) } });
  }
  // With fewer than three pins, or all in a line, the tilt terms can't be pinned down, so the
  // spline goes without them.
  const tilt = solve(pins.map((p) => [p.x / UNIT, p.z / UNIT, p.height]), true) !== null;
  let heights = pins.map((p) => p.height);
  let drops = null;
  let step = null;
  if (m) {
    const terms = pins.map((p) => cliffs.basis(p.x, p.z));
    drops = fitDrops(pins.map((p) => [p.x / UNIT, p.z / UNIT, p.height]), terms, tilt, cliffs);
    step = cliffs.settle(drops.values);
    // What's left for the smooth surface at each pin.
    heights = pins.map((p, i) => p.height - terms[i].reduce((sum, t, k) => sum + t * drops.values[k], 0));
  }
  const pts = pins.map((p, i) => [p.x / UNIT, p.z / UNIT, heights[i]]);
  const low = Math.min(...heights);
  const high = Math.max(...heights);
  const fit = solve(pts, tilt) ?? solve(pts, false);
  // Each pin's share of the soft min and max, measured from the lowest and highest pins so the
  // exponents stay small.
  const below = heights.map((h) => Math.exp(-(h - low) / BOUND.softFt));
  const above = heights.map((h) => Math.exp((h - high) / BOUND.softFt));
  const reach2 = (BOUND.reachFt / UNIT) ** 2;

  const smooth = (x, z) => {
    const u = x / UNIT;
    const v = z / UNIT;
    let h = fit.affine[0] + fit.affine[1] * u + fit.affine[2] * v;
    let nearest = Infinity;
    let total = 0;
    let lowSum = 0;
    let highSum = 0;
    for (let i = 0; i < pts.length; i++) {
      const r2 = (u - pts[i][0]) ** 2 + (v - pts[i][1]) ** 2;
      const r = Math.sqrt(r2);
      h += fit.weights[i] * phi(r);
      nearest = Math.min(nearest, r);
      const w = 1 / (r2 + reach2) ** 2;
      total += w;
      lowSum += w * below[i];
      highSum += w * above[i];
    }
    const floor = low - BOUND.softFt * Math.log(lowSum / total) - BOUND.slackFt;
    const ceiling = high + BOUND.softFt * Math.log(highSum / total) + BOUND.slackFt;
    h = softMin(softMax(h, floor, BOUND.edgeFt), ceiling, BOUND.edgeFt);
    const t = smoothstep(FAR.start / UNIT, FAR.end / UNIT, nearest);
    return h + (defaultHeight - h) * t;
  };
  if (!step) return Object.assign(smooth, { smooth });
  return Object.assign((x, z) => smooth(x, z) + step(x, z), { smooth, step, drops });
}

// The cliffs' drops that leave the ground through the pins (pts, [u, v, height]) least steep
// across each cliff, near it, none less than nothing. terms[i][k] is how far knot k's
// drop moves the ground at pin i, per foot. The ground is the cliffs' field plus the spline
// through the heights less the field's share, which is the spline through the heights less each
// drop times the spline through its terms. So its slope across a cliff at a spot is linear in
// the drops, and the drops minimise its square summed over spots either side of every knot, held a little toward the
// nothing and each other, which settles knots no pin's near. Any that come out below nothing are
// held there, and the rest worked out again.
function fitDrops(pts, terms, tilt, { knots, across, basis }) {
  const n = pts.length;
  const m = knots.length;
  const a = system(pts, tilt, m + 1);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < m; k++) a[i][a.length + k] = terms[i][k];
    a[i][a.length + m] = pts[i][2];
  }
  const x = gauss(a, m + 1);
  if (!x) return { values: new Float64Array(m), short: new Uint8Array(m).fill(1) };
  const g = Array.from({ length: m }, () => new Float64Array(m));
  const r = new Float64Array(m);
  const slope = new Float64Array(m + 1);
  for (const [sx, sz, nx, nz] of across) {
    const [u, v] = [sx / UNIT, sz / UNIT];
    slope.fill(0);
    for (let i = 0; i < n; i++) {
      const [du, dv] = [u - pts[i][0], v - pts[i][1]];
      const r2 = du * du + dv * dv;
      if (r2 === 0) continue;
      const k = (Math.log(r2) + 1) * (du * nx + dv * nz); // phi's slope along (nx, nz)
      for (let j = 0; j <= m; j++) slope[j] += x[i][j] * k;
    }
    if (tilt) for (let j = 0; j <= m; j++) slope[j] += x[n + 1][j] * nx + x[n + 2][j] * nz;
    // The ground's the surface plus the cliffs' own field, whose slope goes the other way.
    const [ahead, behind] = [basis(sx + nx * SLOPE_PROBE_FT, sz + nz * SLOPE_PROBE_FT), basis(sx - nx * SLOPE_PROBE_FT, sz - nz * SLOPE_PROBE_FT)];
    for (let j = 0; j < m; j++) slope[j] -= ((ahead[j] - behind[j]) / (2 * SLOPE_PROBE_FT)) * UNIT;
    for (let k = 0; k < m; k++) {
      for (let j = 0; j < m; j++) g[k][j] += slope[k] * slope[j];
      r[k] += slope[k] * slope[m];
    }
  }
  let trace = 0;
  for (let k = 0; k < m; k++) trace += g[k][k];
  const hold = Math.max(trace / m, 1e-9);
  for (let k = 0; k < m; k++) {
    g[k][k] += hold * DROP_HOLD.none;
    const next = k + 1 < m && knots[k + 1].cliff === knots[k].cliff ? k + 1 : -1;
    if (next < 0) continue;
    g[k][k] += hold * DROP_HOLD.even;
    g[next][next] += hold * DROP_HOLD.even;
    g[k][next] -= hold * DROP_HOLD.even;
    g[next][k] -= hold * DROP_HOLD.even;
  }

  const values = new Float64Array(m);
  const held = new Uint8Array(m);
  for (let round = 0; round < m; round++) {
    const free = [...values.keys()].filter((k) => !held[k]);
    if (!free.length) break;
    const b = free.map((k) => {
      const row = new Float64Array(free.length + 1);
      free.forEach((j, c) => (row[c] = g[k][j]));
      row[free.length] = r[k];
      return row;
    });
    const solved = gauss(b);
    if (!solved) break;
    let more = false;
    free.forEach((k, c) => {
      values[k] = Math.max(0, solved[c][0]);
      if (solved[c][0] < 0) held[k] = more = true;
    });
    if (!more) break;
  }
  return { values, short: values.map((v) => v < CLIFF.shortFt) };
}

// Weights and affine terms for the spline through pts ([u, v, height]), or null when the system
// is singular. With `tilt` off, the affine part is a constant only.
function solve(pts, tilt) {
  const n = pts.length;
  const a = system(pts, tilt, 1);
  for (let i = 0; i < n; i++) a[i][a.length] = pts[i][2];
  const x = gauss(a)?.map((row) => row[0]);
  if (!x) return null;
  return { weights: x.slice(0, n), affine: tilt ? x.slice(n) : [x[n], 0, 0] };
}

// The spline's system for points pts, with room for `columns` right-hand sides, left zero.
function system(pts, tilt, columns) {
  const n = pts.length;
  const size = n + (tilt ? 3 : 1);
  const a = Array.from({ length: size }, () => new Float64Array(size + columns));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) a[i][j] = phi(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
    const affine = tilt ? [1, pts[i][0], pts[i][1]] : [1];
    affine.forEach((value, k) => {
      a[i][n + k] = value;
      a[n + k][i] = value;
    });
  }
  return a;
}

// Solves an augmented matrix with `columns` right-hand sides in place, by Gaussian elimination
// with partial pivoting. Returns a row of solutions per unknown, or null when it's singular.
function gauss(a, columns = 1) {
  const n = a.length;
  const width = n + columns;
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    if (Math.abs(a[pivot][c]) < 1e-9) return null;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c];
      if (f === 0) continue;
      for (let k = c; k < width; k++) a[r][k] -= f * a[c][k];
    }
  }
  const x = Array.from({ length: n }, () => new Float64Array(columns));
  for (let r = n - 1; r >= 0; r--) {
    for (let j = 0; j < columns; j++) {
      let sum = a[r][n + j];
      for (let k = r + 1; k < n; k++) sum -= a[r][k] * x[k][j];
      x[r][j] = sum / a[r][r];
    }
  }
  return x;
}

// min and max with the corner rounded over about k.
function softMin(a, b, k) {
  const t = Math.max(0, Math.min(1, 0.5 + (b - a) / (2 * k)));
  return b + (a - b) * t - k * t * (1 - t);
}

function softMax(a, b, k) {
  return -softMin(-a, -b, k);
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
