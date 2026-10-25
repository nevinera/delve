// The broad shape of the land: a thin-plate spline through every height pin, the smoothest surface
// that passes through them all, like a sheet of metal bent through each pin. A spline overshoots
// past a steep pair of pins, so it's kept between a low and a high bound made from the pins in
// each neighbourhood: it can't dip much below the lowest pin around, or rise above the highest.
// Far from every pin it eases to a default height.
//
// Points are feet in continent space. Solving happens once per continent; each point is then a sum
// over the pins.

const UNIT = 1000; // the spline works in thousands of feet, to keep the solve well conditioned
const FAR = { start: 3000, end: 8000 }; // ft from the nearest pin over which it eases to the default
// The bounds: a soft min and max of the pins' heights, weighted 1 / (r² + reach²)², so a pin counts
// over about `reachFt` around it. `softFt` is how soft the min and max are, `slackFt` how far past
// them the spline may go, and `edgeFt` how gently it bends onto a bound.
const BOUND = { reachFt: 1000, softFt: 15, slackFt: 10, edgeFt: 8 };

const phi = (r) => (r > 0 ? r * r * Math.log(r) : 0);

// pins: [{ x, z, height }]. Returns heightAt(x, z).
export function prepareHeights(pins, defaultHeight) {
  if (!pins.length) return () => defaultHeight;
  const pts = pins.map((p) => [p.x / UNIT, p.z / UNIT, p.height]);
  const low = Math.min(...pins.map((p) => p.height));
  const high = Math.max(...pins.map((p) => p.height));
  // With fewer than three pins, or all in a line, the tilt terms can't be pinned down, so the
  // spline goes without them.
  const fit = solve(pts, true) ?? solve(pts, false);
  // Each pin's share of the soft min and max, measured from the lowest and highest pins so the
  // exponents stay small.
  const below = pins.map((p) => Math.exp(-(p.height - low) / BOUND.softFt));
  const above = pins.map((p) => Math.exp((p.height - high) / BOUND.softFt));
  const reach2 = (BOUND.reachFt / UNIT) ** 2;

  return (x, z) => {
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
}

// Weights and affine terms for the spline through pts ([u, v, height]), or null when the system
// is singular. With `tilt` off, the affine part is a constant only.
function solve(pts, tilt) {
  const n = pts.length;
  const m = tilt ? 3 : 1;
  const size = n + m;
  const a = Array.from({ length: size }, () => new Float64Array(size + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) a[i][j] = phi(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
    const affine = tilt ? [1, pts[i][0], pts[i][1]] : [1];
    affine.forEach((value, k) => {
      a[i][n + k] = value;
      a[n + k][i] = value;
    });
    a[i][size] = pts[i][2];
  }
  const x = gauss(a);
  if (!x) return null;
  return { weights: x.slice(0, n), affine: tilt ? x.slice(n) : [x[n], 0, 0] };
}

// Solves an augmented matrix in place by Gaussian elimination with partial pivoting.
function gauss(a) {
  const n = a.length;
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    if (Math.abs(a[pivot][c]) < 1e-9) return null;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = a[r][n];
    for (let k = r + 1; k < n; k++) sum -= a[r][k] * x[k];
    x[r] = sum / a[r][r];
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
